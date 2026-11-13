import mongoose from "mongoose";

const EXPECTED_HOST = "127.0.0.1";
const EXPECTED_PORT = 27018;
const EXPECTED_MEMBER = `${EXPECTED_HOST}:${EXPECTED_PORT}`;
const EXPECTED_REPLICA_SET = "accountabilityTestRS";
const EXPECTED_DATABASE = "accountability_app_integration_test";
const COLLECTION = "employee_reporting_assignments";

const INDEXES = [
  {
    key: {
      employeeId: 1,
      effectiveStartDate: 1
    },
    options: {
      name: "uniq_employee_assignment_start",
      unique: true
    }
  },
  {
    key: {
      teamLeadId: 1,
      teamId: 1,
      effectiveStartDate: -1
    },
    options: {
      name: "team_lead_assignment_history"
    }
  }
];

const args = process.argv.slice(2);

if (args.some(arg => arg !== "--apply") ||
    args.filter(arg => arg === "--apply").length > 1) {
  throw new Error("Only the optional --apply argument is supported.");
}

const APPLY = args.includes("--apply");

function sameOrderedEntries(left, right) {
  const a = Object.entries(left || {});
  const b = Object.entries(right || {});

  return (
    a.length === b.length &&
    a.every(([key, value], index) =>
      key === b[index][0] && value === b[index][1]
    )
  );
}

function verifyIndex(index, expected) {
  const allowedProperties = new Set([
    "v",
    "key",
    "name",
    "ns",
    "unique"
  ]);

  if (Object.keys(index).some(
    property => !allowedProperties.has(property)
  )) {
    return false;
  }

  const expectedUnique = expected.options.unique === true;

  return (
    index.name === expected.options.name &&
    sameOrderedEntries(index.key, expected.key) &&
    (index.unique === true) === expectedUnique &&
    Number.isInteger(index.v) &&
    (
      index.ns === undefined ||
      index.ns === `${EXPECTED_DATABASE}.${COLLECTION}`
    )
  );
}

async function verifyTarget(connection) {
  if (
    connection.host !== EXPECTED_HOST ||
    Number(connection.port) !== EXPECTED_PORT ||
    connection.name !== EXPECTED_DATABASE ||
    connection.readyState !== 1
  ) {
    throw new Error("Active MongoDB connection identity verification failed.");
  }

  const hello = await connection.db.admin().command({
    hello: 1
  });

  if (
    hello.setName !== EXPECTED_REPLICA_SET ||
    hello.isWritablePrimary !== true ||
    hello.me !== EXPECTED_MEMBER ||
    !Array.isArray(hello.hosts) ||
    hello.hosts.length !== 1 ||
    hello.hosts[0] !== EXPECTED_MEMBER
  ) {
    throw new Error("MongoDB replica-set identity verification failed.");
  }
}

async function inspectCollection(db) {
  const collections = await db.listCollections(
    { name: COLLECTION },
    { nameOnly: true }
  ).toArray();

  if (collections.length === 0) {
    return {
      exists: false,
      indexes: []
    };
  }

  const collection = db.collection(COLLECTION);
  const indexes = await collection.listIndexes().toArray();

  return {
    exists: true,
    indexes
  };
}

function inspectExistingIndexes(existingIndexes) {
  const plan = [];

  for (const expected of INDEXES) {
    const sameName = existingIndexes.find(
      index => index.name === expected.options.name
    );

    if (sameName) {
      if (!verifyIndex(sameName, expected)) {
        throw new Error(
          `Incompatible existing index: ${expected.options.name}`
        );
      }

      plan.push({
        name: expected.options.name,
        action: "ALREADY_CORRECT"
      });

      continue;
    }

    const sameKey = existingIndexes.find(
      index => sameOrderedEntries(index.key, expected.key)
    );

    if (sameKey) {
      throw new Error(
        `Equivalent key exists under another name: ${sameKey.name}. Manual review required.`
      );
    }

    plan.push({
      name: expected.options.name,
      action: "CREATE"
    });
  }

  return plan;
}

async function verifyFinalIndexes(collection) {
  const actualIndexes = await collection.listIndexes().toArray();

  for (const expected of INDEXES) {
    const actual = actualIndexes.find(
      index => index.name === expected.options.name
    );

    if (!actual || !verifyIndex(actual, expected)) {
      throw new Error(
        `Post-migration verification failed: ${expected.options.name}`
      );
    }
  }

  return actualIndexes;
}

async function runMigration() {
  let connection;

  try {
    const uri =
      `mongodb://${EXPECTED_MEMBER}/${EXPECTED_DATABASE}` +
      `?replicaSet=${EXPECTED_REPLICA_SET}`;

    connection = await mongoose.createConnection(uri, {
      autoCreate: false,
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      retryWrites: true
    }).asPromise();

    await verifyTarget(connection);

    const db = connection.db;

    console.log("=== EMPLOYEE ASSIGNMENT INDEX MIGRATION ===");
    console.log("Database:", EXPECTED_DATABASE);
    console.log("Host:", EXPECTED_MEMBER);
    console.log("Replica set:", EXPECTED_REPLICA_SET);
    console.log("Mode:", APPLY ? "EXPLICIT APPLY" : "DRY RUN");

    const state = await inspectCollection(db);

    console.log(
      "Collection:",
      state.exists ? "EXISTS" : "NOT CREATED"
    );

    const plan = inspectExistingIndexes(state.indexes);

    for (const item of plan) {
      console.log(`Index ${item.name}: ${item.action}`);
    }

    const needsCollection = !state.exists;
    const needsIndexes = plan.some(
      item => item.action === "CREATE"
    );

    if (!APPLY) {
      console.log("Collection creation required:", needsCollection);
      console.log("Index creation required:", needsIndexes);
      console.log("DRY RUN COMPLETE. No database modifications performed.");
      return;
    }

    let collection = db.collection(COLLECTION);

    if (needsCollection) {
      await db.createCollection(COLLECTION);
      console.log("COLLECTION CREATED:", COLLECTION);
      collection = db.collection(COLLECTION);
    }

    for (const expected of INDEXES) {
      const item = plan.find(
        entry => entry.name === expected.options.name
      );

      if (item.action === "CREATE") {
        await collection.createIndex(
          expected.key,
          expected.options
        );

        console.log("INDEX CREATED:", expected.options.name);
      }
    }

    const finalIndexes = await verifyFinalIndexes(collection);

    console.log("FINAL INDEX VERIFICATION: PASSED");
    console.log(
      "Verified indexes:",
      finalIndexes
        .filter(index => index.name !== "_id_")
        .map(index => index.name)
    );

    console.log("MIGRATION COMPLETE.");

  } catch (error) {
    console.error("MIGRATION FAILED:", error.message);
    process.exitCode = 1;

  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

runMigration();
