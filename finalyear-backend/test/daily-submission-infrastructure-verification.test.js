
import test from "node:test";
import assert from "node:assert/strict";

import User from "../src/models/User.js";
import ExpectedSubmission from "../src/models/ExpectedSubmission.js";
import MetricSubmission from "../src/models/MetricSubmission.js";

import {
  createDailySubmissionInfrastructureVerifier
} from "../src/services/dailySubmissionInfrastructureVerification.js";

const MODEL_NAMES = [
  "User",
  "ExpectedSubmission",
  "MetricSubmission"
];

const PRODUCTION_MODELS = {
  User,
  ExpectedSubmission,
  MetricSubmission
};

function createIndexes(Model) {
  return Model.schema.indexes().map(([key, options]) => ({
    name: options.name || Object.entries(key)
      .map(([field, direction]) => `${field}_${direction}`)
      .join("_"),
    key,
    ...(options.unique === true ? { unique: true } : {})
  }));
}


function fixture({
  readyState = 1,
  topology = "replicaSet",
  missingIndexes = [],
  indexOverrides = {}
} = {}) {
  const connection = {
    readyState,
    models: {},
    getClient() {
      return {
        db() {
          return {
            admin() {
              return {
                async command(command) {
                  assert.deepEqual(command, { hello: 1 });

                  if (topology === "standalone") {
                    return { isWritablePrimary: true };
                  }

                  if (topology === "sharded") {
                    return { msg: "isdbgrid" };
                  }

                  if (topology === "secondary") {
                    return {
                      setName: "testRS",
                      isWritablePrimary: false,
                      hosts: ["localhost:27017"],
                      primary: "localhost:27017"
                    };
                  }

                  return {
                    setName: "testRS",
                    isWritablePrimary: true,
                    hosts: ["localhost:27017"],
                    primary: "localhost:27017"
                  };
                }
              };
            }
          };
        }
      };
    }
  };

  const models = {};

  for (const modelName of MODEL_NAMES) {
    const ProductionModel = PRODUCTION_MODELS[modelName];

    const indexes = createIndexes(ProductionModel)
      .filter(index => !missingIndexes.includes(index.name))
      .map(index => ({
        ...index,
        ...(indexOverrides[index.name] || {})
      }));

    const Model = function FakeMongooseModel() {};

    Model.modelName = modelName;
    Model.schema = ProductionModel.schema;
    Model.db = connection;

    Model.collection = {
      collectionName: ProductionModel.collection.collectionName,

      async listIndexes() {
        return {
          async toArray() {
            return indexes;
          }
        };
      }
    };

    models[modelName] = Model;
    connection.models[modelName] = Model;
  }

  return { connection, models };
}

test("valid replica-set primary passes infrastructure verification", async () => {
  const { connection, models } = fixture();

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, true);
  assert.equal(result.topology.type, "replicaSet");
  assert.deepEqual(result.errors, []);
});

test("standalone MongoDB fails transaction-topology verification", async () => {
  const { connection, models } = fixture({
    topology: "standalone"
  });

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, false);
  assert.ok(result.errors.length > 0);
});

test("secondary replica-set member fails primary-readiness verification", async () => {
  const { connection, models } = fixture({
    topology: "secondary"
  });

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, false);
});

test("sharded topology is identified without claiming transaction verification", async () => {
  const { connection, models } = fixture({
    topology: "sharded"
  });

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.topology.type, "sharded");
  assert.equal(result.checks.transactionTopology.verified, false);
});

test("disconnected database fails closed", async () => {
  const { connection, models } = fixture({
    readyState: 0
  });

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, false);
});

test("missing required model registration fails closed", async () => {
  const { connection, models } = fixture();

  delete connection.models.ExpectedSubmission;

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, false);
});

test("missing declared index fails closed", async () => {
  const { connection, models } = fixture({
    missingIndexes: ["uniq_expected_submission_employee_date"]
  });

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, false);
  assert.ok(result.errors.some(error =>
    error.includes("uniq_expected_submission_employee_date")
  ));
});

test("incorrect unique-index definition fails closed", async () => {
  const { connection, models } = fixture({
    indexOverrides: {
      uniq_metric_submission_employee_date: {
        unique: false
      }
    }
  });

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, false);
});

test("additional undeclared indexes do not automatically fail verification", async () => {
  const { connection, models } = fixture();

  const originalListIndexes =
    models.User.collection.listIndexes;

  models.User.collection.listIndexes = async () => {
    const cursor = await originalListIndexes();

    return {
      async toArray() {
        return [
          ...(await cursor.toArray()),
          {
            name: "additional_unrelated_index",
            key: { createdAt: 1 }
          }
        ];
      }
    };
  };

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, true);
});

test("index inspection failure fails closed", async () => {
  const { connection, models } = fixture();

  models.MetricSubmission.collection.listIndexes = async () => {
    throw new Error("INDEX_INSPECTION_FAILURE");
  };

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, false);
});

test("verification uses read-only database inspection", async () => {
  const { connection, models } = fixture();

  let helloCalls = 0;
  let indexCalls = 0;
  let writeCalls = 0;

  const originalGetClient = connection.getClient;

  connection.getClient = () => {
    const client = originalGetClient();

    const originalDb = client.db;

    client.db = () => {
      const database = originalDb();

      const originalAdmin = database.admin;

      database.admin = () => {
        const admin = originalAdmin();

        return {
          async command(command) {
            helloCalls += 1;
            return admin.command(command);
          }
        };
      };

      return database;
    };

    return client;
  };

  for (const modelName of MODEL_NAMES) {
    const collection = models[modelName].collection;
    const originalListIndexes = collection.listIndexes;

    collection.listIndexes = async () => {
      indexCalls += 1;
      return originalListIndexes();
    };

    collection.createIndex = async () => {
      writeCalls += 1;
      throw new Error("UNEXPECTED_INDEX_CREATION");
    };
  }

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, true);
  assert.equal(helloCalls, 1);
  assert.equal(indexCalls, MODEL_NAMES.length);
  assert.equal(writeCalls, 0);
});

test("compound index with reversed key order fails verification", async () => {
  const { connection, models } = fixture();

  const collection = models.ExpectedSubmission.collection;
  const originalListIndexes = collection.listIndexes;

  collection.listIndexes = async () => {
    const cursor = await originalListIndexes();

    return {
      async toArray() {
        const indexes = await cursor.toArray();

        return indexes.map(index => {
          if (
            index.name ===
            "uniq_expected_submission_employee_date"
          ) {
            return {
              ...index,
              key: {
                reportingDate: 1,
                employeeId: 1
              }
            };
          }

          return index;
        });
      }
    };
  };

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, false);
  assert.ok(result.errors.some(error =>
    error.includes("uniq_expected_submission_employee_date")
  ));
});

test("missing collection metadata fails safely with structured diagnostics", async () => {
  const { connection, models } = fixture();

  models.MetricSubmission.collection = undefined;

  const verify = createDailySubmissionInfrastructureVerifier({
    connection,
    models
  });

  const result = await verify();

  assert.equal(result.ready, false);
  assert.ok(result.errors.length > 0);
});
