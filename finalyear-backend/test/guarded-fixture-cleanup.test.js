import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import SubmissionPolicy from "../src/models/SubmissionPolicy.js";
import { submitDailySubmission } from "../src/services/dailySubmissionService.js";
import {
  APPROVED_DATABASE_NAME,
  APPROVED_MONGODB_HOST,
  APPROVED_MONGODB_PORT,
  APPROVED_REPLICA_MEMBER,
  APPROVED_REPLICA_SET,
  cleanupIntegrationCollections,
  registerIntegrationFixture,
  setupIntegrationDatabase,
  teardownIntegrationDatabase
} from "./support/mongoIntegration.js";
import {
  createTestSubmissionPolicy,
  registerPlannedTestMetricSubmission
} from "./support/fixtures.js";

function equalValue(left, right) {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (left && typeof left.toHexString === "function") return String(left) === String(right);
  return left === right;
}

function query(value) {
  return {
    select() { return this; },
    session() { return this; },
    read() { return this; },
    readConcern() { return this; },
    lean: async () => typeof value === "function" ? value() : value
  };
}

function makeOfflineClient() {
  const documents = new Map();
  const collectionCalls = [];
  const operations = [];
  const connection = {
    host: null,
    port: null,
    name: null,
    readyState: 0,
    db: {
      admin: () => ({
        command: async command => {
          assert.deepEqual(command, { hello: 1 });
          return {
            setName: APPROVED_REPLICA_SET,
            isWritablePrimary: true,
            me: APPROVED_REPLICA_MEMBER,
            primary: APPROVED_REPLICA_MEMBER,
            hosts: [APPROVED_REPLICA_MEMBER]
          };
        }
      }),
      collection: name => {
        collectionCalls.push(name);
        if (!documents.has(name)) documents.set(name, new Map());
        const rows = documents.get(name);
        return {
          findOne: async (filter, options = {}) => {
            operations.push({ type: "findOne", name, filter });
            const row = rows.get(String(filter._id));
            if (!row) return null;
            return Object.fromEntries(Object.keys(options.projection || row)
              .filter(key => options.projection?.[key] === 1 || !options.projection)
              .map(key => [key, row[key]]));
          },
          deleteOne: async filter => {
            operations.push({ type: "deleteOne", name, filter });
            const key = String(filter._id);
            const row = rows.get(key);
            const matches = row && Object.entries(filter).every(([field, expected]) => equalValue(row[field], expected));
            if (matches) rows.delete(key);
            return { deletedCount: matches ? 1 : 0 };
          }
        };
      }
    }
  };
  const client = {
    connection,
    connect: async (uri, options) => {
      const target = new URL(uri);
      connection.host = target.hostname;
      connection.port = Number(target.port);
      connection.name = target.pathname.slice(1);
      connection.readyState = 1;
      assert.equal(options.autoCreate, false);
      assert.equal(options.autoIndex, false);
    },
    disconnect: async () => { connection.readyState = 0; }
  };
  return { client, connection, documents, collectionCalls, operations };
}

async function withVerifiedOfflineConnection(callback) {
  const fake = makeOfflineClient();
  await setupIntegrationDatabase({ client: fake.client });
  try {
    return await callback(fake);
  } finally {
    await teardownIntegrationDatabase({ client: fake.client });
  }
}

function seedUser(fake, id, email) {
  const row = { _id: id, email, name: "Synthetic test user", role: "team_member", active: true };
  fake.documents.set("users", fake.documents.get("users") || new Map());
  fake.documents.get("users").set(String(id), row);
  return row;
}

function registerUser(fake, row) {
  registerIntegrationFixture({
    connection: fake.connection,
    collectionName: "users",
    id: row._id,
    ownershipFilter: { email: row.email, role: row.role }
  });
}

test("fixture cleanup only deletes registered IDs whose ownership fields still match", async () => {
  await withVerifiedOfflineConnection(async fake => {
    const owned = seedUser(fake, new mongoose.Types.ObjectId(), "owned@example.invalid");
    const unowned = seedUser(fake, new mongoose.Types.ObjectId(), "unowned@example.invalid");
    registerUser(fake, owned);

    const result = await cleanupIntegrationCollections({ connection: fake.connection });

    assert.equal(result.users, 1);
    assert.equal(fake.documents.get("users").has(String(owned._id)), false);
    assert.equal(fake.documents.get("users").has(String(unowned._id)), true);
    assert.deepEqual(fake.operations.filter(operation => operation.type === "deleteOne").map(operation => String(operation.filter._id)), [String(owned._id)]);
  });
});

test("unregistered documents are never read or deleted by fixture cleanup", async () => {
  await withVerifiedOfflineConnection(async fake => {
    const unowned = seedUser(fake, new mongoose.Types.ObjectId(), "keep@example.invalid");
    const result = await cleanupIntegrationCollections({ connection: fake.connection });

    assert.equal(result.users, 0);
    assert.equal(fake.documents.get("users").has(String(unowned._id)), true);
    assert.deepEqual(fake.collectionCalls, []);
    assert.deepEqual(fake.operations, []);
  });
});

test("fixture cleanup remains safe after partial fixture creation", async () => {
  await withVerifiedOfflineConnection(async fake => {
    const firstFixture = seedUser(fake, new mongoose.Types.ObjectId(), "partial@example.invalid");
    const unrelatedPolicy = {
      _id: new mongoose.Types.ObjectId(),
      policyVersion: "unregistered-policy"
    };
    fake.documents.set("submission_policies", new Map([[String(unrelatedPolicy._id), unrelatedPolicy]]));
    registerUser(fake, firstFixture);
    // Simulate a later fixture creation failing before it can be registered.

    const result = await cleanupIntegrationCollections({ connection: fake.connection });

    assert.equal(result.users, 1);
    assert.equal(result.submission_policies, 0);
    assert.equal(fake.documents.get("submission_policies").has(String(unrelatedPolicy._id)), true);
  });
});

test("fixture registration and cleanup cannot target collections outside the allowlist", async () => {
  await withVerifiedOfflineConnection(async fake => {
    const id = new mongoose.Types.ObjectId();
    assert.throws(() => registerIntegrationFixture({
      connection: fake.connection,
      collectionName: "submission_corrections",
      id,
      ownershipFilter: { employeeId: id, reportingDate: "2026-11-12", actualSubmittedAt: new Date(), policyVersion: "v1" }
    }), /outside the integration allowlist/);

    await cleanupIntegrationCollections({
      connection: fake.connection,
      collectionNames: ["submission_corrections"]
    });
    assert.deepEqual(fake.collectionCalls, []);
    assert.deepEqual(fake.operations, []);
  });
});

test("repeated fixture cleanup is harmless", async () => {
  await withVerifiedOfflineConnection(async fake => {
    const owned = seedUser(fake, new mongoose.Types.ObjectId(), "repeat@example.invalid");
    registerUser(fake, owned);

    const first = await cleanupIntegrationCollections({ connection: fake.connection });
    const deletesAfterFirstCleanup = fake.operations.filter(operation => operation.type === "deleteOne").length;
    const second = await cleanupIntegrationCollections({ connection: fake.connection });

    assert.equal(first.users, 1);
    assert.equal(second.users, 0);
    assert.equal(fake.operations.filter(operation => operation.type === "deleteOne").length, deletesAfterFirstCleanup);
  });
});

test("cleanup leaves a registered ID intact if its ownership marker changed", async () => {
  await withVerifiedOfflineConnection(async fake => {
    const row = seedUser(fake, new mongoose.Types.ObjectId(), "original@example.invalid");
    registerUser(fake, row);
    fake.documents.get("users").get(String(row._id)).email = "changed@example.invalid";

    const result = await cleanupIntegrationCollections({ connection: fake.connection });

    assert.equal(result.users, 0);
    assert.equal(fake.documents.get("users").has(String(row._id)), true);
    assert.equal(fake.operations.some(operation => operation.type === "deleteOne"), false);
  });
});

test("policy fixture version preserves its prefix and appends a unique UUID without database writes", async () => {
  const connection = SubmissionPolicy.db;
  assert.equal(connection.readyState, 0, "Offline fixture test requires a disconnected Mongoose connection.");
  const keys = ["_readyState", "host", "port", "name", "db"];
  const originalDescriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(connection, key)]));
  const originalCreate = SubmissionPolicy.create;
  const mockedCreateCalls = [];
  const fakeDb = {
    databaseName: APPROVED_DATABASE_NAME,
    admin: () => ({
      command: async () => ({
        setName: APPROVED_REPLICA_SET,
        isWritablePrimary: true,
        me: APPROVED_REPLICA_MEMBER,
        primary: APPROVED_REPLICA_MEMBER,
        hosts: [APPROVED_REPLICA_MEMBER]
      })
    }),
    collection: () => ({
      findOne: async () => null,
      deleteOne: async () => ({ deletedCount: 0 })
    })
  };
  const fakeClient = {
    connection,
    connect: async () => {
      connection._readyState = 1;
      connection.host = APPROVED_MONGODB_HOST;
      connection.port = APPROVED_MONGODB_PORT;
      connection.name = APPROVED_DATABASE_NAME;
      connection.db = fakeDb;
    },
    disconnect: async () => { connection._readyState = 0; }
  };

  try {
    SubmissionPolicy.create = async fixture => {
      mockedCreateCalls.push(fixture);
      return fixture;
    };
    await setupIntegrationDatabase({ client: fakeClient });

    const prefix = "offline-policy-prefix";
    const first = await createTestSubmissionPolicy({ overrides: { policyVersion: prefix } });
    const second = await createTestSubmissionPolicy({ overrides: { policyVersion: prefix } });
    const uuidSuffix = new RegExp("^" + prefix + "-" +
      "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", "i");

    assert.match(first.policyVersion, uuidSuffix);
    assert.match(second.policyVersion, uuidSuffix);
    assert.notEqual(first.policyVersion, second.policyVersion);
    assert.equal(mockedCreateCalls.length, 2);
    assert.equal(connection.readyState, 1);
  } finally {
    try {
      if (connection.readyState !== 0) await teardownIntegrationDatabase({ client: fakeClient });
    } finally {
      SubmissionPolicy.create = originalCreate;
      for (const [key, descriptor] of originalDescriptors) {
        if (descriptor) Object.defineProperty(connection, key, descriptor);
        else delete connection[key];
      }
    }
  }
});

test("planned MetricSubmission fixture is registered before service execution and cleans safely if absent", async () => {
  await withVerifiedOfflineConnection(async fake => {
    const plannedId = new mongoose.Types.ObjectId("64b0000000000000000000f1");
    const employeeId = new mongoose.Types.ObjectId("64b0000000000000000000f2");
    const deadlineAt = new Date("2026-11-12T04:00:00.000Z");
    const actualSubmittedAt = new Date("2026-11-12T02:00:00.000Z");
    const eventOrder = [];
    const expected = {
      _id: new mongoose.Types.ObjectId(),
      employeeId,
      reportingDate: "2026-11-12",
      expected: true,
      status: "Pending",
      submissionId: null,
      deadlineAt,
      policyVersion: "offline-v1",
      statusEvaluatedAt: null
    };
    const saved = [];
    class MetricModel {
      constructor(document) { Object.assign(this, document); }
      async save({ session }) {
        assert.ok(session);
        saved.push(this);
        return this;
      }
      static findOne() { return query(null); }
    }
    const models = {
      User: {
        findById: () => {
          eventOrder.push("service-started");
          return query({
            _id: employeeId,
            role: "team_member",
            active: true,
            employmentStartDate: "2026-01-01",
            employmentEndDate: null
          });
        }
      },
      MetricSubmission: MetricModel,
      ExpectedSubmission: {
        findOne: () => query(expected),
        updateOne: async (filter, update, options) => {
          assert.ok(options.session);
          Object.assign(expected, update.$set);
          return { matchedCount: 1 };
        }
      },
      SubmissionPolicy: {
        findOne: () => query({
          policyVersion: "offline-v1",
          effectiveStartDate: "2026-01-01",
          effectiveEndDate: null,
          deadlineLocalTime: "09:30",
          timezone: "Asia/Kolkata"
        }),
        find: () => ({ lean: async () => [{ policyVersion: "offline-v1" }] })
      }
    };
    const client = {
      startSession: async () => ({
        withTransaction: async callback => callback(),
        endSession: async () => {}
      })
    };

    const registeredId = registerPlannedTestMetricSubmission({
      connection: fake.connection,
      submissionId: plannedId,
      employeeId,
      reportingDate: "2026-11-12",
      actualSubmittedAt,
      policyVersion: "offline-v1"
    });
    eventOrder.push("fixture-registered");
    assert.equal(String(registeredId), String(plannedId));

    const result = await submitDailySubmission({
      authenticatedUser: { id: String(employeeId) },
      request: {
        reportingDate: "2026-11-12",
        metrics: {
          ticketsAssigned: 1,
          ticketsResolved: 1,
          slaBreaches: 0,
          reopenedTickets: 0,
          clientInteractions: 0
        }
      },
      clock: () => actualSubmittedAt,
      submissionIdFactory: () => plannedId,
      models,
      mongooseClient: client
    });
    eventOrder.push("service-finished");

    assert.deepEqual(eventOrder, ["fixture-registered", "service-started", "service-finished"]);
    assert.equal(String(saved[0]._id), String(plannedId));
    assert.equal(String(expected.submissionId), String(plannedId));
    assert.equal(result.data.submissionId, String(plannedId));

    const deleted = await cleanupIntegrationCollections({ connection: fake.connection });
    assert.equal(deleted.metric_submissions, 0);
    assert.deepEqual(fake.operations.filter(operation => operation.type === "findOne")
      .map(operation => String(operation.filter._id)), [String(plannedId)]);
    assert.equal(fake.operations.some(operation => operation.type === "deleteOne"), false);
  });
});
