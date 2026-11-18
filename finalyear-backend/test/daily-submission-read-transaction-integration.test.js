import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../src/models/User.js";
import SubmissionPolicy from "../src/models/SubmissionPolicy.js";
import ExpectedSubmission from "../src/models/ExpectedSubmission.js";
import MetricSubmission from "../src/models/MetricSubmission.js";
import { getOwnDay } from "../src/services/dailySubmissionReadService.js";
import { runReadTransaction } from "../src/services/readTransaction.js";
import {
  cleanupIntegrationCollections,
  INTEGRATION_COLLECTION_ALLOWLIST,
  withIntegrationDatabase
} from "./support/mongoIntegration.js";
import {
  createTestExpectedSubmission,
  createTestSubmissionPolicy,
  createTestUser
} from "./support/fixtures.js";

const REPORTING_DATE = "2026-11-12";
const DEADLINE_AT = new Date("2026-11-12T04:00:00.000Z");
const FIXED_NOW = new Date("2026-11-12T08:00:00.000Z");

function replaceMethod(target, name, replacement) {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: descriptor?.enumerable ?? false,
    writable: true,
    value: replacement
  });

  return () => {
    if (descriptor) Object.defineProperty(target, name, descriptor);
    else delete target[name];
  };
}

function observeQuerySessions(Model, methodName, observations) {
  const original = Model[methodName];
  if (typeof original !== "function") {
    throw new TypeError(`${Model.modelName}.${methodName} is unavailable.`);
  }

  return replaceMethod(Model, methodName, function (...args) {
    const query = original.apply(this, args);
    if (!query || typeof query.session !== "function") {
      throw new TypeError(`${Model.modelName}.${methodName} did not return a session-aware query.`);
    }

    const originalSession = query.session;
    replaceMethod(query, "session", function (session) {
      observations.push({
        model: Model.modelName,
        session,
        inTransaction: session?.inTransaction?.() === true
      });
      return originalSession.call(this, session);
    });
    return query;
  });
}

function observeTransactionLifecycle(connection) {
  const sessions = [];
  const restorers = [];
  const originalStartSession = connection.startSession;
  if (typeof originalStartSession !== "function") {
    throw new TypeError("The guarded connection cannot start sessions.");
  }

  let restoreStartSession;
  let restored = false;

  function restore() {
    if (restored) return;
    restored = true;

    let restorationError;
    while (restorers.length) {
      try {
        restorers.pop()();
      } catch (error) {
        restorationError ||= error;
      }
    }

    try {
      restoreStartSession?.();
    } catch (error) {
      restorationError ||= error;
    }

    if (restorationError) throw restorationError;
  }

  try {
    restoreStartSession = replaceMethod(
      connection,
      "startSession",
      function (...args) {
        return Promise.resolve(originalStartSession.apply(this, args)).then(session => {
          const record = {
            session,
            transactionOptions: null,
            endSessionCalls: 0
          };
          sessions.push(record);

          try {
            const originalWithTransaction = session.withTransaction;
            const originalEndSession = session.endSession;
            restorers.push(replaceMethod(
              session,
              "withTransaction",
              function (callback, options, ...rest) {
                record.transactionOptions = options;
                return originalWithTransaction.call(this, callback, options, ...rest);
              }
            ));
            restorers.push(replaceMethod(
              session,
              "endSession",
              function (...endArgs) {
                record.endSessionCalls += 1;
                return originalEndSession.apply(this, endArgs);
              }
            ));
          } catch (error) {
            try {
              restore();
            } catch (restorationError) {
              throw new AggregateError(
                [error, restorationError],
                "Session instrumentation failed and restoration was incomplete."
              );
            }
            throw error;
          }

          return session;
        });
      }
    );
  } catch (error) {
    try {
      restore();
    } catch (restorationError) {
      throw new AggregateError(
        [error, restorationError],
        "Connection instrumentation failed and restoration was incomplete."
      );
    }
    throw error;
  }

  return { sessions, restore };
}
function assertSnapshotTransaction(record) {
  assert.ok(record);
  assert.deepEqual(record.transactionOptions, {
    readPreference: "primary",
    readConcern: { level: "snapshot" }
  });
  assert.equal(record.endSessionCalls, 1);
}

async function cleanupAndVerify(connection, fixtures) {
  const deleted = await cleanupIntegrationCollections({ connection });

  for (const [Model, fixture] of fixtures) {
    if (!fixture) continue;
    assert.equal(
      await Model.exists({ _id: fixture._id }),
      null,
      `${Model.modelName} fixture must be removed by registered-ID cleanup.`
    );
  }

  return deleted;
}

test("offline instrumentation restores normally and repeated restoration is harmless", async () => {
  const session = {
    async withTransaction(callback) {
      return callback();
    },
    async endSession() {}
  };
  const connection = {
    async startSession() {
      return session;
    }
  };
  const originalConnectionDescriptor = Object.getOwnPropertyDescriptor(connection, "startSession");
  const originalWithTransactionDescriptor = Object.getOwnPropertyDescriptor(session, "withTransaction");
  const originalEndSessionDescriptor = Object.getOwnPropertyDescriptor(session, "endSession");
  const observer = observeTransactionLifecycle(connection);

  const observedSession = await connection.startSession();
  await observedSession.withTransaction(async () => "completed", {
    readPreference: "primary",
    readConcern: { level: "snapshot" }
  });
  await observedSession.endSession();

  assert.equal(observer.sessions.length, 1);
  assertSnapshotTransaction(observer.sessions[0]);
  observer.restore();
  observer.restore();

  assert.deepEqual(Object.getOwnPropertyDescriptor(connection, "startSession"), originalConnectionDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptor(session, "withTransaction"), originalWithTransactionDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptor(session, "endSession"), originalEndSessionDescriptor);
});

test("offline instrumentation restores methods after a transaction callback failure", async () => {
  const session = {
    async withTransaction(callback) {
      return callback();
    },
    async endSession() {}
  };
  const connection = {
    async startSession() {
      return session;
    }
  };
  const originalConnectionDescriptor = Object.getOwnPropertyDescriptor(connection, "startSession");
  const originalWithTransactionDescriptor = Object.getOwnPropertyDescriptor(session, "withTransaction");
  const originalEndSessionDescriptor = Object.getOwnPropertyDescriptor(session, "endSession");
  const observer = observeTransactionLifecycle(connection);
  const observedSession = await connection.startSession();
  const sentinel = new Error("OFFLINE_TRANSACTION_FAILURE");

  await assert.rejects((async () => {
    try {
      await observedSession.withTransaction(async () => {
        throw sentinel;
      }, { readPreference: "primary", readConcern: { level: "snapshot" } });
    } finally {
      await observedSession.endSession();
    }
  })(), error => error === sentinel);

  observer.restore();
  observer.restore();
  assert.deepEqual(Object.getOwnPropertyDescriptor(connection, "startSession"), originalConnectionDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptor(session, "withTransaction"), originalWithTransactionDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptor(session, "endSession"), originalEndSessionDescriptor);
  assert.equal(observer.sessions[0].endSessionCalls, 1);
});

test("offline instrumentation restores the connection when withTransaction instrumentation fails", async () => {
  const session = {};
  Object.defineProperty(session, "withTransaction", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: async () => undefined
  });
  Object.defineProperty(session, "endSession", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: async () => undefined
  });
  const connection = {
    async startSession() {
      return session;
    }
  };
  const originalConnectionDescriptor = Object.getOwnPropertyDescriptor(connection, "startSession");
  const originalWithTransactionDescriptor = Object.getOwnPropertyDescriptor(session, "withTransaction");
  const observer = observeTransactionLifecycle(connection);

  await assert.rejects(connection.startSession(), TypeError);
  assert.deepEqual(Object.getOwnPropertyDescriptor(connection, "startSession"), originalConnectionDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptor(session, "withTransaction"), originalWithTransactionDescriptor);
  observer.restore();
  observer.restore();
  assert.deepEqual(Object.getOwnPropertyDescriptor(connection, "startSession"), originalConnectionDescriptor);
});

test("offline instrumentation restores the partial session patch when endSession instrumentation fails", async () => {
  const session = {};
  Object.defineProperty(session, "withTransaction", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: async function (callback) {
      return callback();
    }
  });
  Object.defineProperty(session, "endSession", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: async () => undefined
  });
  const connection = {
    async startSession() {
      return session;
    }
  };
  const originalConnectionDescriptor = Object.getOwnPropertyDescriptor(connection, "startSession");
  const originalWithTransactionDescriptor = Object.getOwnPropertyDescriptor(session, "withTransaction");
  const originalEndSessionDescriptor = Object.getOwnPropertyDescriptor(session, "endSession");
  const observer = observeTransactionLifecycle(connection);

  await assert.rejects(connection.startSession(), TypeError);
  assert.deepEqual(Object.getOwnPropertyDescriptor(connection, "startSession"), originalConnectionDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptor(session, "withTransaction"), originalWithTransactionDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptor(session, "endSession"), originalEndSessionDescriptor);
  observer.restore();
  observer.restore();
  assert.deepEqual(Object.getOwnPropertyDescriptor(connection, "startSession"), originalConnectionDescriptor);
});
test("getOwnDay reads a synthetic Pending day in the production snapshot transaction", async () => {
  await withIntegrationDatabase(async connection => {
    assert.equal(connection, mongoose.connection);
    assert.deepEqual([...INTEGRATION_COLLECTION_ALLOWLIST], [
      "users",
      "submission_policies",
      "expected_submissions",
      "metric_submissions"
    ]);

    let user;
    let policy;
    let expected;
    const fixtures = [
      [User, null],
      [SubmissionPolicy, null],
      [ExpectedSubmission, null]
    ];

    try {
      user = await createTestUser();
      fixtures[0][1] = user;

      policy = await createTestSubmissionPolicy({
        overrides: {
          policyVersion: "read-transaction-test-policy",
          deadlineLocalTime: "09:30",
          timezone: "Asia/Kolkata",
          effectiveStartDate: REPORTING_DATE,
          effectiveEndDate: REPORTING_DATE,
          active: true
        }
      });
      fixtures[1][1] = policy;

      expected = await createTestExpectedSubmission({
        employeeId: user._id,
        reportingDate: REPORTING_DATE,
        deadlineAt: DEADLINE_AT,
        policyVersion: policy.policyVersion,
        overrides: {
          expected: true,
          status: "Pending",
          submissionId: null
        }
      });
      fixtures[2][1] = expected;

      assert.equal(String(expected.employeeId), String(user._id));
      assert.equal(expected.reportingDate, REPORTING_DATE);
      assert.equal(expected.expected, true);
      assert.equal(expected.status, "Pending");
      assert.equal(expected.submissionId, null);
      assert.equal(expected.policyVersion, policy.policyVersion);
      assert.equal(expected.deadlineAt.getTime(), DEADLINE_AT.getTime());

      const bindings = [];
      const restoreQueryObservers = [];
      let transactionObserver;
      let result;
      try {
        restoreQueryObservers.push(observeQuerySessions(User, "findById", bindings));
        restoreQueryObservers.push(observeQuerySessions(ExpectedSubmission, "findOne", bindings));
        restoreQueryObservers.push(observeQuerySessions(MetricSubmission, "findOne", bindings));
        transactionObserver = observeTransactionLifecycle(connection);

        // No dependency override is supplied, so getOwnDay uses the production
        // runner bound to mongoose.connection, which is this guarded connection.
        result = await getOwnDay({
          authenticatedUserId: String(user._id),
          reportingDate: REPORTING_DATE,
          clock: () => new Date(FIXED_NOW)
        });
      } finally {
        transactionObserver?.restore();
        for (const restore of restoreQueryObservers.reverse()) restore();
      }

      assert.deepEqual(
        {
          employeeId: result.employeeId,
          reportingDate: result.reportingDate,
          expected: result.expected,
          status: result.status,
          policyVersion: result.policyVersion,
          submission: result.submission
        },
        {
          employeeId: String(user._id),
          reportingDate: REPORTING_DATE,
          expected: true,
          status: "Pending",
          policyVersion: policy.policyVersion,
          submission: null
        }
      );

      assert.equal(
        await MetricSubmission.countDocuments({
          employeeId: user._id,
          reportingDate: REPORTING_DATE
        }),
        0,
        "A Pending expected day must not have a MetricSubmission."
      );

      assert.equal(transactionObserver.sessions.length, 1);
      const transactionRecord = transactionObserver.sessions[0];
      assertSnapshotTransaction(transactionRecord);

      for (const requiredModel of ["User", "ExpectedSubmission", "MetricSubmission"]) {
        assert.ok(
          bindings.some(binding => binding.model === requiredModel),
          `${requiredModel} must be queried by the read service.`
        );
      }
      assert.ok(bindings.length >= 3);
      for (const binding of bindings) {
        assert.equal(binding.session, transactionRecord.session);
        assert.equal(binding.inTransaction, true);
      }
    } finally {
      const deleted = await cleanupAndVerify(connection, fixtures);
      if (user) assert.equal(deleted.users, 1);
      if (policy) assert.equal(deleted.submission_policies, 1);
      if (expected) assert.equal(deleted.expected_submissions, 1);
    }
  });
});

test("production read transaction runner aborts a session-bound synthetic read and ends its session", async () => {
  await withIntegrationDatabase(async connection => {
    assert.equal(connection, mongoose.connection);
    let user;
    const fixtures = [[User, null]];

    try {
      user = await createTestUser();
      fixtures[0][1] = user;

      const bindings = [];
      let restoreQueryObserver;
      let transactionObserver;
      const sentinel = new Error("READ_TRANSACTION_ABORT_SENTINEL");

      try {
        restoreQueryObserver = observeQuerySessions(User, "findById", bindings);
        transactionObserver = observeTransactionLifecycle(connection);

        await assert.rejects(
          runReadTransaction(async session => {
            const actor = await User.findById(user._id)
              .select("_id")
              .session(session)
              .lean();

            assert.ok(actor);
            assert.equal(String(actor._id), String(user._id));
            throw sentinel;
          }),
          error => error === sentinel
        );
      } finally {
        transactionObserver?.restore();
        restoreQueryObserver?.();
      }

      assert.equal(transactionObserver.sessions.length, 1);
      const transactionRecord = transactionObserver.sessions[0];
      assertSnapshotTransaction(transactionRecord);
      assert.equal(bindings.length, 1);
      assert.equal(bindings[0].session, transactionRecord.session);
      assert.equal(bindings[0].inTransaction, true);
    } finally {
      const deleted = await cleanupAndVerify(connection, fixtures);
      if (user) assert.equal(deleted.users, 1);
    }
  });
});