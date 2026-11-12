
import mongoose from "mongoose";
import { isDeepStrictEqual } from "node:util";

const EXPECTED_HOST = "127.0.0.1:27018";
const EXPECTED_REPLICA_SET = "accountabilityTestRS";
const EXPECTED_DATABASE = "accountability_app_integration_test";

const INDEX_NAME = "uniq_user_employee_code";

const INDEX_KEY = { employeeCode: 1 };

const INDEX_OPTIONS = {
  name: INDEX_NAME,
  unique: true,
  partialFilterExpression: {
    employeeCode: { $type: "string" }
  }
};

const APPLY = process.argv.includes("--apply");

function sameOrderedEntries(left, right) {
  const a = Object.entries(left || {});
  const b = Object.entries(right || {});

  return (
    a.length === b.length &&
    a.every(([key, value], index) =>
      key === b[index][0] &&
      value === b[index][1]
    )
  );
}


function hasExpectedIndexOptions(index) {
  // MongoDB-generated metadata is permitted.
  const allowedProperties = new Set([
    "v",
    "key",
    "name",
    "ns",
    "unique",
    "partialFilterExpression"
  ]);

  // Reject any unexpected index option.
  if (
    Object.keys(index).some(
      property => !allowedProperties.has(property)
    )
  ) {
    return false;
  }

  return (
    sameOrderedEntries(index.key, INDEX_KEY) &&
    index.unique === true &&
    isDeepStrictEqual(
      index.partialFilterExpression,
      INDEX_OPTIONS.partialFilterExpression
    ) &&
    Number.isInteger(index.v) &&
    (index.ns === undefined || index.ns === `${EXPECTED_DATABASE}.users`)
  );
}
function isCorrectIndex(index) {
  return (
    index.name === INDEX_NAME &&
    hasExpectedIndexOptions(index)
  );
}
async function runMigration() {
  let connection;

  try {
    connection = await mongoose.createConnection(
      "mongodb://127.0.0.1:27018/?replicaSet=accountabilityTestRS",
      {
        dbName: EXPECTED_DATABASE,
        autoCreate: false,
        autoIndex: false,
        serverSelectionTimeoutMS: 5000
      }
    ).asPromise();

    const hello = await connection.db.admin().command({
      hello: 1
    });

    if (
      hello.setName !== EXPECTED_REPLICA_SET ||
      hello.isWritablePrimary !== true ||
      hello.me !== EXPECTED_HOST ||
      !Array.isArray(hello.hosts) ||
      hello.hosts.length !== 1 ||
      hello.hosts[0] !== EXPECTED_HOST
    ) {
      throw new Error("MongoDB target verification failed.");
    }

    if (connection.db.databaseName !== EXPECTED_DATABASE) {
      throw new Error("Unexpected database.");
    }

    const db = connection.db;

    const collections = await db.listCollections(
      { name: "users" },
      { nameOnly: true }
    ).toArray();

    if (collections.length !== 1) {
      throw new Error("Expected users collection does not exist.");
    }

    const users = db.collection("users");

    console.log("Verified target:", EXPECTED_DATABASE);
    console.log("Mode:", APPLY ? "EXPLICIT APPLY" : "DRY RUN");

    const indexes = await users.listIndexes().toArray();

    const namedIndex = indexes.find(
      index => index.name === INDEX_NAME
    );

    if (namedIndex) {
      if (!isCorrectIndex(namedIndex)) {
        throw new Error(
          "The requested index name exists with an incompatible definition."
        );
      }

      console.log("The requested index already exists and is correct.");
      return;
    }

    const sameKeyIndex = indexes.find(
      index => sameOrderedEntries(index.key, INDEX_KEY)
    );

    if (sameKeyIndex) {
      if (hasExpectedIndexOptions(sameKeyIndex)) {
        console.log(
          "An equivalent index exists under another name:",
          sameKeyIndex.name
        );

        console.log(
          "No new index will be created. Manual naming review required."
        );
        return;
      }

      throw new Error(
        "An incompatible index already uses the employeeCode key."
      );
    }

    const invalidCount = await users.countDocuments({
      employeeCode: { $type: "string" },
      $nor: [
        { employeeCode: /^[A-Z]{2,4}-[0-9]{3,6}$/ }
      ]
    });

    if (invalidCount > 0) {
      throw new Error(
        `Found ${invalidCount} invalid employee codes.`
      );
    }

    const duplicates = await users.aggregate([
      {
        $match: {
          employeeCode: { $type: "string" }
        }
      },
      {
        $group: {
          _id: "$employeeCode",
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      { $limit: 10 }
    ]).toArray();

    if (duplicates.length > 0) {
      throw new Error(
        "Duplicate employee codes found. Migration blocked."
      );
    }

    console.log("Existing index definitions checked.");
    console.log("Invalid employee codes:", invalidCount);
    console.log("Duplicate employee codes:", duplicates.length);
    console.log("Proposed key:", INDEX_KEY);
    console.log("Proposed options:", INDEX_OPTIONS);

    if (!APPLY) {
      console.log(
        "DRY RUN COMPLETE. No database modifications performed."
      );
      return;
    }

    await users.createIndex(INDEX_KEY, INDEX_OPTIONS);

    const updatedIndexes = await users.listIndexes().toArray();

    const createdIndex = updatedIndexes.find(
      index => index.name === INDEX_NAME
    );

    if (!createdIndex || !isCorrectIndex(createdIndex)) {
      throw new Error(
        "Post-creation index verification failed."
      );
    }

    console.log("INDEX CREATED AND VERIFIED:", INDEX_NAME);

  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;

  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

runMigration();