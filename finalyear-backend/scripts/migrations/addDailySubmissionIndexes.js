
import mongoose from "mongoose";

// This migration is intentionally locked to the verified local development
// database. It does not read MONGO_URI or any other environment variable.
const EXPECTED_HOST = "localhost";
const EXPECTED_PORT = 27017;
const EXPECTED_DATABASE = "finalyear_metrics";
const EXPECTED_URI =
  "mongodb://localhost:27017/finalyear_metrics";

const COLLECTIONS = [
  "expected_submissions",
  "metric_submissions",
  "submission_policies"
];

const INDEXES = [
  {
    collection: "expected_submissions",
    key: {
      employeeId: 1,
      reportingDate: 1
    },
    options: {
      name: "uniq_expected_submission_employee_date",
      unique: true
    }
  },
  {
    collection: "expected_submissions",
    key: {
      reportingDate: 1,
      status: 1
    },
    options: {
      name: "expected_submission_date_status"
    }
  },
  {
    collection: "expected_submissions",
    key: {
      status: 1,
      deadlineAt: 1
    },
    options: {
      name: "expected_submission_due_status"
    }
  },
  {
    collection: "metric_submissions",
    key: {
      employeeId: 1,
      reportingDate: 1
    },
    options: {
      name: "uniq_metric_submission_employee_date",
      unique: true
    }
  },
  {
    collection: "metric_submissions",
    key: {
      reportingDate: 1,
      status: 1
    },
    options: {
      name: "metric_submission_date_status"
    }
  },
  {
    collection: "metric_submissions",
    key: {
      employeeId: 1,
      reportingDate: -1
    },
    options: {
      name: "metric_submission_employee_history"
    }
  },
  {
    collection: "submission_policies",
    key: {
      policyVersion: 1
    },
    options: {
      name: "uniq_submission_policy_version",
      unique: true
    }
  },
  {
    collection: "submission_policies",
    key: {
      active: 1,
      effectiveStartDate: 1,
      effectiveEndDate: 1
    },
    options: {
      name: "submission_policy_effectivity"
    }
  }
];

const args = process.argv.slice(2);

if (
  args.some(argument => argument !== "--apply") ||
  args.filter(argument => argument === "--apply").length > 1
) {
  throw new Error(
    "Unsupported arguments. Run without arguments for a dry run, " +
    "or provide the single optional argument --apply."
  );
}

const APPLY = args.includes("--apply");

function sameOrderedEntries(left, right) {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});

  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value], index) =>
      key === rightEntries[index][0] &&
      value === rightEntries[index][1]
    )
  );
}

function verifyIndex(actual, expected, collectionName) {
  // Reject unreviewed index options instead of silently accepting a
  // definition that differs from the schema declaration.
  const allowedProperties = new Set([
    "v",
    "key",
    "name",
    "ns",
    "unique"
  ]);

  if (
    Object.keys(actual).some(
      property => !allowedProperties.has(property)
    )
  ) {
    return false;
  }

  const expectedUnique = expected.options.unique === true;

  return (
    actual.name === expected.options.name &&
    sameOrderedEntries(actual.key, expected.key) &&
    (actual.unique === true) === expectedUnique &&
    Number.isInteger(actual.v) &&
    (
      actual.ns === undefined ||
      actual.ns === `${EXPECTED_DATABASE}.${collectionName}`
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
    throw new Error(
      "Active MongoDB connection identity verification failed. " +
      "Expected localhost:27017/finalyear_metrics."
    );
  }

  const hello = await connection.db.admin().command({
    hello: 1
  });

  if (
    hello.isWritablePrimary !== true ||
    hello.setName !== undefined ||
    hello.msg === "isdbgrid"
  ) {
    throw new Error(
      "MongoDB topology verification failed. " +
      "Expected the verified standalone development instance."
    );
  }
}

async function inspectCollection(db, collectionName) {
  const collections = await db.listCollections(
    { name: collectionName },
    { nameOnly: true }
  ).toArray();

  if (collections.length !== 1) {
    throw new Error(
      `Expected collection "${collectionName}" does not exist. ` +
      "This migration will not create collections."
    );
  }

  const collection = db.collection(collectionName);
  const indexes = await collection.listIndexes().toArray();

  return {
    collection,
    indexes
  };
}

function buildIndexPlan(existingIndexes, collectionName) {
  const expectedIndexes = INDEXES.filter(
    index => index.collection === collectionName
  );

  const plan = [];

  for (const expected of expectedIndexes) {
    const sameName = existingIndexes.find(
      index => index.name === expected.options.name
    );

    const sameKeyUnderAnotherName = existingIndexes.find(
      index =>
        index.name !== expected.options.name &&
        sameOrderedEntries(index.key, expected.key)
    );

    if (sameKeyUnderAnotherName) {
      throw new Error(
        `Equivalent key pattern for "${expected.options.name}" ` +
        `also exists as "${sameKeyUnderAnotherName.name}". ` +
        "Manual review is required; the migration will not rename, " +
        "drop, or replace indexes."
      );
    }

    if (sameName) {
      if (!verifyIndex(sameName, expected, collectionName)) {
        throw new Error(
          `Index "${expected.options.name}" exists with an ` +
          "incompatible definition."
        );
      }

      plan.push({
        expected,
        action: "ALREADY_CORRECT"
      });

      continue;
    }

    plan.push({
      expected,
      action: "CREATE"
    });
  }

  return plan;
}

function getDuplicateGroupExpression(index) {
  const fields = Object.keys(index.key);

  if (fields.length === 1) {
    return `$${fields[0]}`;
  }

  return Object.fromEntries(
    fields.map(field => [field, `$${field}`])
  );
}

async function findDuplicateGroups(collection, index) {
  // MongoDB groups missing indexed fields as null in this expression.
  // This catches duplicate compound keys, including repeated missing/null
  // combinations that would prevent creation of a non-partial unique index.
  const [result] = await collection.aggregate([
    {
      $group: {
        _id: getDuplicateGroupExpression(index),
        count: { $sum: 1 }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    },
    {
      $facet: {
        summary: [{ $count: "total" }],
        examples: [{ $limit: 10 }]
      }
    }
  ]).toArray();

  return {
    count: result?.summary?.[0]?.total ?? 0,
    examples: result?.examples ?? []
  };
}

async function preflightUniqueIndexes(collectionStates) {
  const failures = [];

  for (const expected of INDEXES.filter(
    index => index.options.unique === true
  )) {
    const state = collectionStates.get(expected.collection);

    const duplicates = await findDuplicateGroups(
      state.collection,
      expected
    );

    console.log(
      `Duplicate groups for ${expected.options.name}:`,
      duplicates.count
    );

    if (duplicates.count > 0) {
      console.error(
        `Up to 10 duplicate examples for ${expected.options.name}:`
      );

      console.error(
        JSON.stringify(duplicates.examples, null, 2)
      );

      failures.push(expected.options.name);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      "Unique-index preflight failed. Duplicate groups were found in: " +
      failures.join(", ") +
      ". No indexes have been created."
    );
  }
}

async function verifyFinalIndexes(collectionStates) {
  const verified = [];

  for (const collectionName of COLLECTIONS) {
    const state = collectionStates.get(collectionName);

    const actualIndexes = await state.collection
      .listIndexes()
      .toArray();

    for (const expected of INDEXES.filter(
      index => index.collection === collectionName
    )) {
      const actual = actualIndexes.find(
        index => index.name === expected.options.name
      );

      if (
        !actual ||
        !verifyIndex(actual, expected, collectionName)
      ) {
        throw new Error(
          `Post-migration verification failed for ` +
          `"${expected.options.name}".`
        );
      }

      verified.push(expected.options.name);
    }
  }

  return verified;
}

async function runMigration() {
  let connection;

  try {
    connection = await mongoose.createConnection(
      EXPECTED_URI,
      {
        autoCreate: false,
        autoIndex: false,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000
      }
    ).asPromise();

    await verifyTarget(connection);

    const db = connection.db;

    console.log("=== DAILY SUBMISSION INDEX MIGRATION ===");
    console.log("Host:", `${EXPECTED_HOST}:${EXPECTED_PORT}`);
    console.log("Database:", EXPECTED_DATABASE);
    console.log("Topology: standalone");
    console.log("Mode:", APPLY ? "EXPLICIT APPLY" : "DRY RUN");

    const collectionStates = new Map();
    const plans = new Map();

    // Inspect every required collection before any index creation.
    for (const collectionName of COLLECTIONS) {
      const state = await inspectCollection(db, collectionName);

      collectionStates.set(collectionName, state);

      const plan = buildIndexPlan(
        state.indexes,
        collectionName
      );

      plans.set(collectionName, plan);

      console.log(`\nCollection: ${collectionName}`);

      for (const item of plan) {
        console.log(
          `Index ${item.expected.options.name}: ${item.action}`
        );
      }
    }

    // Run every unique-index preflight before creating any index.
    await preflightUniqueIndexes(collectionStates);

    const creationCount = [...plans.values()]
      .flat()
      .filter(item => item.action === "CREATE")
      .length;

    console.log("\nIndexes requiring creation:", creationCount);

    if (!APPLY) {
      console.log(
        "DRY RUN COMPLETE. No collections, documents, or indexes were modified."
      );

      return;
    }

    // Create only missing indexes.
    // Existing indexes are never dropped, rebuilt, renamed, or replaced.
    for (const collectionName of COLLECTIONS) {
      const collection = collectionStates.get(
        collectionName
      ).collection;

      for (const item of plans.get(collectionName)) {
        if (item.action !== "CREATE") {
          continue;
        }

        await collection.createIndex(
          item.expected.key,
          item.expected.options
        );

        console.log(
          "INDEX CREATED:",
          item.expected.options.name
        );
      }
    }

    const verifiedIndexes = await verifyFinalIndexes(
      collectionStates
    );

    console.log("\nPOST-MIGRATION VERIFICATION: PASSED");
    console.log("Verified indexes:", verifiedIndexes);
    console.log("MIGRATION COMPLETE.");

  } catch (error) {
    console.error("MIGRATION FAILED:", error.message);
    process.exitCode = 1;

  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error(
          "Failed to close migration connection:",
          closeError.message
        );

        process.exitCode = 1;
      }
    }
  }
}

runMigration();
