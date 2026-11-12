import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  APPROVED_DATABASE_NAME,
  APPROVED_MONGODB_HOST,
  APPROVED_MONGODB_PORT,
  APPROVED_REPLICA_MEMBER,
  APPROVED_REPLICA_SET,
  INTEGRATION_COLLECTION_ALLOWLIST,
  INTEGRATION_TEST_URI,
  cleanupIntegrationCollections,
  getVerifiedIntegrationIdentity,
  registerIntegrationFixture,
  setupIntegrationDatabase,
  teardownIntegrationDatabase,
  validateIntegrationTarget,
  verifyDeclaredIndexes,
  withIntegrationDatabase
} from "./support/mongoIntegration.js";
import { createTestUser } from "./support/fixtures.js";

function matchesFixtureFilter(document, filter) {
  return Object.entries(filter).every(([field, expected]) => {
    const actual = document[field];
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    if (expected && typeof expected.toHexString === "function") return actual != null && String(actual) === String(expected);
    return actual === expected;
  });
}

function makeOfflineClient({
  connectionOverrides = {},
  helloOverrides = {}
} = {}) {
  const cleanupCalls = [];
  const collectionCalls = [];
  const fixtureDocuments = new Map();
  const connection = {
    host: APPROVED_MONGODB_HOST,
    port: APPROVED_MONGODB_PORT,
    name: APPROVED_DATABASE_NAME,
    readyState: 0,
    db: {
      admin: () => ({
        command: async () => ({
          setName: APPROVED_REPLICA_SET,
          isWritablePrimary: true,
          me: APPROVED_REPLICA_MEMBER,
          primary: APPROVED_REPLICA_MEMBER,
          hosts: [APPROVED_REPLICA_MEMBER],
          ...helloOverrides
        })
      }),
      collection: name => {
        collectionCalls.push(name);
        if (!fixtureDocuments.has(name)) fixtureDocuments.set(name, new Map());
        const documents = fixtureDocuments.get(name);
        return {
          findOne: async (filter, options) => {
            cleanupCalls.push({ operation: "findOne", name, filter, options });
            const document = documents.get(String(filter._id));
            if (!document) return null;
            const projectedFields = Object.keys(options?.projection || document)
              .filter(field => !options?.projection || options.projection[field] === 1);
            return Object.fromEntries(projectedFields.map(field => [field, document[field]]));
          },
          deleteOne: async filter => {
            cleanupCalls.push({ operation: "deleteOne", name, filter });
            const key = String(filter._id);
            const document = documents.get(key);
            if (document && matchesFixtureFilter(document, filter)) {
              documents.delete(key);
              return { deletedCount: 1 };
            }
            return { deletedCount: 0 };
          },
          deleteMany: async filter => {
            cleanupCalls.push({ operation: "deleteMany", name, filter });
            return { deletedCount: 0 };
          }
        };
      }
    },
    ...connectionOverrides
  };
  const metrics = {
    connectCalls: 0,
    disconnectCalls: 0,
    receivedTarget: null,
    cleanupCalls,
    collectionCalls,
    fixtureDocuments
  };
  const client = {
    connection,
    connect: async (target,options) => {
      metrics.connectCalls += 1;
      metrics.receivedTarget = target;
      metrics.receivedOptions = options;
      connection.readyState = 1;
      return client;
    },
    disconnect: async () => {
      metrics.disconnectCalls += 1;
      connection.readyState = 0;
    }
  };
  return { client, metrics };
}

test("approved integration target is accepted", () => {
  assert.deepEqual(validateIntegrationTarget(INTEGRATION_TEST_URI), {
    hostname: "127.0.0.1",
    port: 27018,
    databaseName: "accountability_app_integration_test",
    replicaSetName: "accountabilityTestRS"
  });
});

test("guarded connection disables automatic collection and index creation", async () => {
  const { client, metrics } = makeOfflineClient();

  await setupIntegrationDatabase({ client });

  try {
    assert.equal(metrics.receivedOptions.autoCreate, false);
    assert.equal(metrics.receivedOptions.autoIndex, false);
  } finally {
    await teardownIntegrationDatabase({ client });
  }
});

test("wrong hostname is rejected", () => {
  assert.throws(
    () => validateIntegrationTarget(INTEGRATION_TEST_URI.replace("127.0.0.1", "localhost")),
    /host is not approved/
  );
});

test("wrong port is rejected", () => {
  assert.throws(
    () => validateIntegrationTarget(INTEGRATION_TEST_URI.replace(":27018/", ":27019/")),
    /port is not approved/
  );
});

test("wrong database is rejected", () => {
  assert.throws(
    () => validateIntegrationTarget(INTEGRATION_TEST_URI.replace(APPROVED_DATABASE_NAME, "accountability_transaction_test")),
    /database is not approved/
  );
});

test("wrong replica-set name is rejected", () => {
  assert.throws(
    () => validateIntegrationTarget(INTEGRATION_TEST_URI.replace(APPROVED_REPLICA_SET, "otherReplicaSet")),
    /unexpected or invalid URI options/
  );
});

test("credentials are rejected", () => {
  assert.throws(
    () => validateIntegrationTarget(INTEGRATION_TEST_URI.replace("mongodb://", "mongodb://user:secret@")),
    /Credentials are not allowed/
  );
  assert.throws(
    () => validateIntegrationTarget(INTEGRATION_TEST_URI.replace("mongodb://", "mongodb://@")),
    /Credentials are not allowed/
  );
});

test("unexpected URI options are rejected", () => {
  assert.throws(
    () => validateIntegrationTarget(INTEGRATION_TEST_URI + "&tls=true"),
    /unexpected or invalid URI options/
  );
});

test("failed target guard prevents a connection attempt", async () => {
  const { client, metrics } = makeOfflineClient();
  await assert.rejects(
    setupIntegrationDatabase({
      client,
      target: INTEGRATION_TEST_URI.replace(":27018/", ":27019/")
    }),
    /port is not approved/
  );
  assert.equal(metrics.connectCalls, 0);
  assert.equal(metrics.disconnectCalls, 0);
});

test("failed verification guard prevents cleanup", async () => {
  const { client, metrics } = makeOfflineClient();
  await assert.rejects(
    cleanupIntegrationCollections({ connection: client.connection }),
    /identity has not been verified/
  );
  assert.equal(metrics.cleanupCalls.length, 0);
});

test("application MONGO_URI cannot override the fixed test target", async () => {
  const { client, metrics } = makeOfflineClient();
  process.env.MONGO_URI = "mongodb://not-approved.invalid:27017/application";
  try {
    const connection = await setupIntegrationDatabase({ client });
    assert.equal(metrics.receivedTarget, INTEGRATION_TEST_URI);
    await teardownIntegrationDatabase({ client });
    assert.equal(connection.readyState, 0);
  } finally {
    delete process.env.MONGO_URI;
  }
});

test("connection verification rejects the wrong replica set and closes the client", async () => {
  const { client, metrics } = makeOfflineClient({
    helloOverrides: { setName: "wrongReplicaSet" }
  });
  await assert.rejects(
    setupIntegrationDatabase({ client }),
    /not the approved replica-set primary/
  );
  assert.equal(metrics.connectCalls, 1);
  assert.equal(metrics.disconnectCalls, 1);
});

test("connection verification rejects unexpected replica-set members", async () => {
  const { client, metrics } = makeOfflineClient({
    helloOverrides: { hosts: [APPROVED_REPLICA_MEMBER, "remote.example:27018"] }
  });
  await assert.rejects(
    setupIntegrationDatabase({ client }),
    /not the approved single local member/
  );
  assert.equal(metrics.disconnectCalls, 1);
});

test("cleanup after verification uses only the allowlist and preserves the probe database", async () => {
  const { client, metrics } = makeOfflineClient();
  const connection = await setupIntegrationDatabase({ client });
  try {
    const fixtureId = new mongoose.Types.ObjectId();
    const unregisteredId = new mongoose.Types.ObjectId();
    const registeredFixture = {
      _id: fixtureId,
      email: "registered@example.invalid",
      role: "team_member"
    };
    const unregisteredDocument = {
      _id: unregisteredId,
      email: "unregistered@example.invalid",
      role: "team_member"
    };
    metrics.fixtureDocuments.set("users", new Map([
      [String(fixtureId), registeredFixture],
      [String(unregisteredId), unregisteredDocument]
    ]));
    registerIntegrationFixture({
      connection,
      collectionName: "users",
      id: fixtureId,
      ownershipFilter: { email: registeredFixture.email, role: registeredFixture.role }
    });
    assert.throws(() => registerIntegrationFixture({
      connection,
      collectionName: "transaction_probe",
      id: new mongoose.Types.ObjectId(),
      ownershipFilter: { policyVersion: "probe-only" }
    }), /outside the integration allowlist/);

    const counts = await cleanupIntegrationCollections({ connection });
    assert.deepEqual(Object.keys(counts), [...INTEGRATION_COLLECTION_ALLOWLIST]);
    assert.deepEqual(metrics.collectionCalls, ["users"]);
    assert.deepEqual(metrics.cleanupCalls.map(call => call.operation), ["findOne", "deleteOne"]);
    assert.ok(metrics.cleanupCalls.every(call => String(call.filter._id) === String(fixtureId)));
    assert.equal(metrics.cleanupCalls.some(call => call.operation === "deleteMany"), false);
    assert.equal(metrics.fixtureDocuments.get("users").has(String(fixtureId)), false);
    assert.equal(metrics.fixtureDocuments.get("users").has(String(unregisteredId)), true);
    assert.equal(INTEGRATION_COLLECTION_ALLOWLIST.includes("transaction_probe"), false);
    assert.equal(metrics.receivedTarget, INTEGRATION_TEST_URI);
  } finally {
    await teardownIntegrationDatabase({ client });
  }
  assert.equal(metrics.disconnectCalls, 1);
});

test("verified identity is available only for the approved connection", async () => {
  const { client } = makeOfflineClient();
  const connection = await setupIntegrationDatabase({ client });
  try {
    assert.deepEqual(getVerifiedIntegrationIdentity(connection), {
      host: APPROVED_MONGODB_HOST,
      port: APPROVED_MONGODB_PORT,
      databaseName: APPROVED_DATABASE_NAME,
      replicaSetName: APPROVED_REPLICA_SET,
      isWritablePrimary: true,
      member: APPROVED_REPLICA_MEMBER,
      primary: APPROVED_REPLICA_MEMBER,
      members: [APPROVED_REPLICA_MEMBER]
    });
  } finally {
    await teardownIntegrationDatabase({ client });
  }
});

test("read-only index verification reports missing indexes without creating them", async () => {
  const { client } = makeOfflineClient();
  const connection = await setupIntegrationDatabase({ client });
  let createCalls = 0;
  const Model = {
    modelName: "OfflineUser",
    db: connection,
    schema: { indexes: () => [[{ email: 1 }, { unique: true, name: "email_1" }]] },
    collection: {
      collectionName: "users",
      listIndexes: () => ({ toArray: async () => [{ name: "_id_", key: { _id: 1 } }] }),
      createIndex: async () => { createCalls += 1; }
    }
  };

  try {
    await assert.rejects(verifyDeclaredIndexes(Model), /Missing declared index.*email_1/);
    assert.equal(createCalls, 0);
  } finally {
    await teardownIntegrationDatabase({ client });
  }
});

test("read-only index verification reports incompatible indexes without creating them", async () => {
  const { client } = makeOfflineClient();
  const connection = await setupIntegrationDatabase({ client });
  let createCalls = 0;
  const Model = {
    modelName: "OfflineUser",
    db: connection,
    schema: { indexes: () => [[{ email: 1 }, { unique: true, name: "email_1" }]] },
    collection: {
      collectionName: "users",
      listIndexes: () => ({ toArray: async () => [{ name: "email_1", key: { email: 1 }, unique: false }] }),
      createIndex: async () => { createCalls += 1; }
    }
  };

  try {
    await assert.rejects(verifyDeclaredIndexes(Model), /Incompatible declared index.*email_1/);
    assert.equal(createCalls, 0);
  } finally {
    await teardownIntegrationDatabase({ client });
  }
});

test("synthetic fixture helpers refuse to write before connection verification", async () => {
  await assert.rejects(createTestUser(), /identity has not been verified/);
});

test("withIntegrationDatabase closes the connection when its callback fails", async () => {
  const { client, metrics } = makeOfflineClient();
  await assert.rejects(
    withIntegrationDatabase(async () => {
      throw new Error("synthetic callback failure");
    }, { client }),
    /synthetic callback failure/
  );
  assert.equal(metrics.disconnectCalls, 1);
  assert.equal(client.connection.readyState, 0);
});
