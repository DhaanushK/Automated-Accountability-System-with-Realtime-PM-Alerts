import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../src/models/User.js";
import SubmissionPolicy from "../src/models/SubmissionPolicy.js";
import ExpectedSubmission from "../src/models/ExpectedSubmission.js";
import MetricSubmission from "../src/models/MetricSubmission.js";
import SubmissionCorrection from "../src/models/SubmissionCorrection.js";
import { classifySubmission } from "../src/services/submissionPolicyService.js";
import * as dailySubmissionService from "../src/services/dailySubmissionService.js";
import {
  APPROVED_DATABASE_NAME,
  APPROVED_MONGODB_HOST,
  APPROVED_MONGODB_PORT,
  APPROVED_REPLICA_SET,
  INTEGRATION_COLLECTION_ALLOWLIST,
  cleanupIntegrationCollections,
  getVerifiedIntegrationIdentity,
  verifyDeclaredIndexes,
  withIntegrationDatabase
} from "./support/mongoIntegration.js";
import {
  createTestExpectedSubmission,
  createTestSubmissionPolicy,
  createTestUser,
  registerPlannedTestMetricSubmission
} from "./support/fixtures.js";

const REPORTING_DATE = "2026-11-12";
const DEADLINE_AT = new Date("2026-11-12T04:00:00.000Z");
const FIXED_SUBMISSION_AT = new Date("2026-11-12T02:00:00.000Z");
const POLICY_VERSION = "phase3b4-integration-test-v1";

const MODELS = [User, SubmissionPolicy, ExpectedSubmission, MetricSubmission];

function createInitialLookupBarrierMetricSubmissionModel() {
  let initialLookupCount = 0;
  let releaseInitialLookups;
  let barrierReleased = false;

  const initialLookupsReleased = new Promise(resolve => {
    releaseInitialLookups = resolve;
  });

  const releaseBarrier = error => {
    if (barrierReleased) return;

    barrierReleased = true;
    clearTimeout(timeout);

    releaseInitialLookups({ error });
  };

  const timeout = setTimeout(() => {
    releaseBarrier(
      new Error(
        "Concurrent submission test timed out waiting for both initial lookups."
      )
    );
  }, 10000);

  const gatedModel = new Proxy(MetricSubmission, {
    get(target, property) {
      if (property === "findOne") {
        return (...args) => {
          const query = target.findOne(...args);
          const originalLean = query.lean.bind(query);

          if (initialLookupCount >= 2) {
            return query;
          }

          query.lean = async (...leanArgs) => {
            let result;

            try {
              result = await originalLean(...leanArgs);
            } catch (error) {
              releaseBarrier(error);
              throw error;
            }

            initialLookupCount += 1;

            if (initialLookupCount === 2) {
              releaseBarrier(null);
            }

            const barrierResult = await initialLookupsReleased;

            if (barrierResult.error) {
              throw barrierResult.error;
            }

            return result;
          };

          return query;
        };
      }

      const value = Reflect.get(target, property, target);

      return typeof value === "function"
        ? value.bind(target)
        : value;
    }
  });

  return {
    model: gatedModel,
    getInitialLookupCount: () => initialLookupCount
  };
}

test("verified application test database indexes and synthetic fixture lifecycle", async () => {
  let verification;
  let guardedConnection;
  const fixtureIds = new Map(MODELS.map(Model => [Model.modelName, []]));
  await withIntegrationDatabase(async connection => {
    guardedConnection = connection;
    try {
      assert.deepEqual([...INTEGRATION_COLLECTION_ALLOWLIST], [
        "users",
        "submission_policies",
        "expected_submissions",
        "metric_submissions"
      ]);

      const identity = getVerifiedIntegrationIdentity(connection);
      assert.deepEqual(
        {
          host: identity.host,
          port: identity.port,
          databaseName: identity.databaseName,
          replicaSetName: identity.replicaSetName,
          isWritablePrimary: identity.isWritablePrimary,
          member: identity.member,
          members: identity.members
        },
        {
          host: APPROVED_MONGODB_HOST,
          port: APPROVED_MONGODB_PORT,
          databaseName: APPROVED_DATABASE_NAME,
          replicaSetName: APPROVED_REPLICA_SET,
          isWritablePrimary: true,
          member: "127.0.0.1:27018",
          members: ["127.0.0.1:27018"]
        }
      );

      const indexResults = [];
      for (const Model of MODELS) {
        indexResults.push(await verifyDeclaredIndexes(Model));
      }

      const user = await createTestUser();
      fixtureIds.get("User").push(user._id);
      const policy = await createTestSubmissionPolicy({
        overrides: {
          policyVersion: POLICY_VERSION,
          effectiveStartDate: REPORTING_DATE,
          effectiveEndDate: REPORTING_DATE
        }
      });
      fixtureIds.get("SubmissionPolicy").push(policy._id);
      const expected = await createTestExpectedSubmission({
        employeeId: user._id,
        reportingDate: REPORTING_DATE,
        deadlineAt: DEADLINE_AT,
        policyVersion: policy.policyVersion
      });
      fixtureIds.get("ExpectedSubmission").push(expected._id);

      assert.equal(expected.employeeId.toString(), user._id.toString());
      assert.equal(expected.reportingDate, REPORTING_DATE);
      assert.equal(expected.expected, true);
      assert.equal(expected.status, "Pending");
      assert.equal(expected.submissionId, null);
      assert.equal(expected.policyVersion, policy.policyVersion);
      assert.equal(expected.deadlineAt.toISOString(), DEADLINE_AT.toISOString());

      assert.equal(classifySubmission(DEADLINE_AT, expected.deadlineAt), "On-Time");
      assert.equal(
        classifySubmission(new Date(DEADLINE_AT.getTime() + 1), expected.deadlineAt),
        "Late"
      );

      verification = {
        identity,
        indexResults,
        fixturesCreated: {
          users: 1,
          submissionPolicies: 1,
          expectedSubmissions: 1,
          metricSubmissions: 0
        },
        punctualitySnapshot: {
          reportingDate: expected.reportingDate,
          deadlineAt: expected.deadlineAt.toISOString(),
          policyVersion: expected.policyVersion,
          equality: classifySubmission(DEADLINE_AT, expected.deadlineAt),
          afterDeadline: classifySubmission(
            new Date(DEADLINE_AT.getTime() + 1),
            expected.deadlineAt
          )
        }
      };
    } finally {
      const deleted = await cleanupIntegrationCollections({ connection });
      for (const Model of MODELS) {
        for (const fixtureId of fixtureIds.get(Model.modelName)) {
          assert.equal(await Model.exists({ _id: fixtureId }), null,
            Model.modelName + " fixture record must be cleaned.");
        }
      }
      const collectionsAfterCleanup = await connection.db
        .listCollections({}, { nameOnly: true })
        .toArray();
      verification = {
        ...verification,
        cleanupDeleted: deleted,
        cleanupVerifiedEmpty: true,
        collectionsAfterCleanup: collectionsAfterCleanup.map(item => item.name).sort()
      };
    }
  });

  assert.equal(guardedConnection.readyState, 0, "Guarded Mongoose connection must close after test cleanup.");
  verification.connectionClosed = true;

  console.log("Isolated application index and fixture verification:");
  console.log(JSON.stringify(verification, null, 2));
});

test("A. successful application submission transition", async () => {
  assert.equal(typeof dailySubmissionService.submitDailySubmission, "function",
    "The real daily submission write service must be available.");

  await withIntegrationDatabase(async connection => {
    for (const Model of MODELS) {
      await verifyDeclaredIndexes(Model);
    }

    const user = await createTestUser();
    const policy = await createTestSubmissionPolicy({
      overrides: {
        policyVersion: POLICY_VERSION,
        deadlineLocalTime: "09:30",
        timezone: "Asia/Kolkata",
        effectiveStartDate: REPORTING_DATE,
        effectiveEndDate: REPORTING_DATE
      }
    });
    const expected = await createTestExpectedSubmission({
      employeeId: user._id,
      reportingDate: REPORTING_DATE,
      deadlineAt: DEADLINE_AT,
      policyVersion: policy.policyVersion
    });

    const plannedSubmissionId = new mongoose.Types.ObjectId("64b0000000000000000000a1");
    const requestMetrics = {
      ticketsAssigned: 8,
      ticketsResolved: 7,
      slaBreaches: 1,
      reopenedTickets: 2,
      clientInteractions: 5,
      remarks: "Scenario A synthetic integration submission"
    };

    // Register ownership before the service can persist the planned ID, so
    // guarded teardown can clean it even if assertions fail after commit.
    registerPlannedTestMetricSubmission({
      connection,
      submissionId: plannedSubmissionId,
      employeeId: user._id,
      reportingDate: REPORTING_DATE,
      actualSubmittedAt: FIXED_SUBMISSION_AT,
      policyVersion: expected.policyVersion
    });

    const result = await dailySubmissionService.submitDailySubmission({
      authenticatedUser: { id: String(user._id) },
      request: { reportingDate: REPORTING_DATE, metrics: requestMetrics },
      clock: () => new Date(FIXED_SUBMISSION_AT),
      submissionIdFactory: () => plannedSubmissionId
    });

    const submissions = await MetricSubmission.find({
      employeeId: user._id,
      reportingDate: REPORTING_DATE
    }).lean();
    assert.equal(submissions.length, 1, "Exactly one MetricSubmission must exist for this employee-day.");

    const [submission] = submissions;
    const updatedExpected = await ExpectedSubmission.findOne({
      _id: expected._id,
      employeeId: user._id,
      reportingDate: REPORTING_DATE
    }).lean();
    const expectedStatus = classifySubmission(FIXED_SUBMISSION_AT, expected.deadlineAt);

    assert.equal(String(submission._id), String(plannedSubmissionId));
    assert.deepEqual(submission.metrics, requestMetrics);
    assert.equal(new Date(submission.actualSubmittedAt).getTime(), FIXED_SUBMISSION_AT.getTime());
    assert.equal(new Date(submission.applicableDeadlineAt).getTime(), expected.deadlineAt.getTime());
    assert.equal(submission.status, expectedStatus);
    assert.equal(submission.policyVersion, expected.policyVersion);

    assert.ok(updatedExpected, "ExpectedSubmission must remain available after the write.");
    assert.equal(updatedExpected.status, expectedStatus);
    assert.equal(String(updatedExpected.submissionId), String(submission._id));
    assert.equal(new Date(updatedExpected.statusEvaluatedAt).getTime(), FIXED_SUBMISSION_AT.getTime());

    assert.equal(result.success, true);
    assert.equal(result.data.isReplay, false);
    assert.equal(result.data.submissionId, String(plannedSubmissionId));
  });
});


test("B. atomic rollback after ExpectedSubmission update failure", async () => {
  await withIntegrationDatabase(async connection => {
    for (const Model of MODELS) {
      await verifyDeclaredIndexes(Model);
    }

    const user = await createTestUser();

    const policy = await createTestSubmissionPolicy({
      overrides: {
        policyVersion: POLICY_VERSION,
        deadlineLocalTime: "09:30",
        timezone: "Asia/Kolkata",
        effectiveStartDate: REPORTING_DATE,
        effectiveEndDate: REPORTING_DATE
      }
    });

    const expected = await createTestExpectedSubmission({
      employeeId: user._id,
      reportingDate: REPORTING_DATE,
      deadlineAt: DEADLINE_AT,
      policyVersion: policy.policyVersion
    });

    const plannedSubmissionId =
      new mongoose.Types.ObjectId("64b0000000000000000000b1");

    const requestMetrics = {
      ticketsAssigned: 6,
      ticketsResolved: 5,
      slaBreaches: 0,
      reopenedTickets: 1,
      clientInteractions: 3,
      remarks: "Scenario B rollback test"
    };

    // Register the planned ID before the transaction can persist it.
    registerPlannedTestMetricSubmission({
      connection,
      submissionId: plannedSubmissionId,
      employeeId: user._id,
      reportingDate: REPORTING_DATE,
      actualSubmittedAt: FIXED_SUBMISSION_AT,
      policyVersion: expected.policyVersion
    });

    let updateAttempted = false;

    // Real ExpectedSubmission reads, controlled conditional-update failure.
    const injectedExpectedSubmissionModel = {
  findOne: (...args) => ExpectedSubmission.findOne(...args),

  updateOne: async (filter, update, options) => {
    updateAttempted = true;

    // Preserve the real update operation and transaction session,
    // but guarantee that no ExpectedSubmission document matches.
    return ExpectedSubmission.updateOne(
      {
        ...filter,
        _id: { $exists: false }
      },
      update,
      options
    );
  }
};

    await assert.rejects(
      dailySubmissionService.submitDailySubmission({
        authenticatedUser: { id: String(user._id) },

        request: {
          reportingDate: REPORTING_DATE,
          metrics: requestMetrics
        },

        clock: () => new Date(FIXED_SUBMISSION_AT),
        submissionIdFactory: () => plannedSubmissionId,

        models: {
          ExpectedSubmission: injectedExpectedSubmissionModel
        }
      }),

      error =>
        error.code === "EXPECTED_SUBMISSION_STATE_CHANGED"
    );

    // Confirm that the second operation was reached.
    assert.equal(updateAttempted, true);

    // The first write must have been rolled back.
    const persistedSubmission = await MetricSubmission.findOne({
      _id: plannedSubmissionId,
      employeeId: user._id,
      reportingDate: REPORTING_DATE
    }).lean();

    assert.equal(
      persistedSubmission,
      null,
      "MetricSubmission must not survive the aborted transaction."
    );

    // The original expected-day state must remain unchanged.
    const persistedExpected = await ExpectedSubmission.findById(
      expected._id
    ).lean();

    assert.ok(persistedExpected);

    assert.equal(persistedExpected.status, "Pending");
    assert.equal(persistedExpected.submissionId, null);
    assert.equal(persistedExpected.statusEvaluatedAt, null);
  });
});



test("C. identical duplicate replays and conflicting duplicate is rejected", async () => {
  assert.equal(
    typeof dailySubmissionService.submitDailySubmission,
    "function",
    "The real daily submission write service must be available."
  );

  await withIntegrationDatabase(async connection => {
    for (const Model of MODELS) {
      await verifyDeclaredIndexes(Model);
    }

    const user = await createTestUser();

    const policy = await createTestSubmissionPolicy({
      overrides: {
        policyVersion: POLICY_VERSION,
        deadlineLocalTime: "09:30",
        timezone: "Asia/Kolkata",
        effectiveStartDate: REPORTING_DATE,
        effectiveEndDate: REPORTING_DATE
      }
    });

    const expected = await createTestExpectedSubmission({
      employeeId: user._id,
      reportingDate: REPORTING_DATE,
      deadlineAt: DEADLINE_AT,
      policyVersion: policy.policyVersion
    });

    const plannedSubmissionId =
      new mongoose.Types.ObjectId("64b0000000000000000000c1");

    const requestMetrics = {
      ticketsAssigned: 7,
      ticketsResolved: 6,
      slaBreaches: 1,
      reopenedTickets: 2,
      clientInteractions: 4,
      remarks: "Scenario C identical replay test"
    };

    registerPlannedTestMetricSubmission({
      connection,
      submissionId: plannedSubmissionId,
      employeeId: user._id,
      reportingDate: REPORTING_DATE,
      actualSubmittedAt: FIXED_SUBMISSION_AT,
      policyVersion: expected.policyVersion
    });

    const makeSubmissionArguments = metrics => ({
      authenticatedUser: { id: String(user._id) },
      request: {
        reportingDate: REPORTING_DATE,
        metrics
      },
      clock: () => new Date(FIXED_SUBMISSION_AT),
      submissionIdFactory: () => plannedSubmissionId
    });

    // C1: First submission must persist as a new submission.
    const firstResult =
      await dailySubmissionService.submitDailySubmission(
        makeSubmissionArguments(requestMetrics)
      );

    assert.equal(firstResult.success, true);
    assert.equal(firstResult.data.isReplay, false);
    assert.equal(
      firstResult.data.submissionId,
      String(plannedSubmissionId)
    );

    const originalSubmission = await MetricSubmission.findOne({
      _id: plannedSubmissionId,
      employeeId: user._id,
      reportingDate: REPORTING_DATE
    }).lean();

    assert.ok(originalSubmission);

    const originalSnapshot = {
      id: String(originalSubmission._id),
      actualSubmittedAt: new Date(
        originalSubmission.actualSubmittedAt
      ).getTime(),
      applicableDeadlineAt: new Date(
        originalSubmission.applicableDeadlineAt
      ).getTime(),
      status: originalSubmission.status,
      policyVersion: originalSubmission.policyVersion,
      metrics: { ...originalSubmission.metrics }
    };

    const expectedAfterFirst = await ExpectedSubmission.findById(
      expected._id
    ).lean();

    assert.ok(expectedAfterFirst);
    assert.equal(expectedAfterFirst.status, originalSnapshot.status);
    assert.equal(
      String(expectedAfterFirst.submissionId),
      originalSnapshot.id
    );

    // C1: Identical request must replay the original submission.
    const replayResult =
      await dailySubmissionService.submitDailySubmission(
        makeSubmissionArguments(requestMetrics)
      );

    assert.equal(replayResult.success, true);
    assert.equal(replayResult.data.isReplay, true);
    assert.equal(
      replayResult.data.submissionId,
      originalSnapshot.id
    );

    const submissionsAfterReplay = await MetricSubmission.find({
      employeeId: user._id,
      reportingDate: REPORTING_DATE
    }).lean();

    assert.equal(
      submissionsAfterReplay.length,
      1,
      "An identical replay must not create another MetricSubmission."
    );

    // C2: Changed payload must produce a conflict.
    const conflictingMetrics = {
      ...requestMetrics,
      ticketsResolved: requestMetrics.ticketsResolved + 1,
      remarks: "Scenario C conflicting duplicate test"
    };

    await assert.rejects(
      dailySubmissionService.submitDailySubmission(
        makeSubmissionArguments(conflictingMetrics)
      ),
      error =>
        error.status === 409 &&
        error.code === "SUBMISSION_CONFLICT"
    );

    // Verify the original submission was not modified.
    const finalSubmission = await MetricSubmission.findOne({
      employeeId: user._id,
      reportingDate: REPORTING_DATE
    }).lean();

    assert.ok(finalSubmission);
    assert.equal(String(finalSubmission._id), originalSnapshot.id);
    assert.equal(
      new Date(finalSubmission.actualSubmittedAt).getTime(),
      originalSnapshot.actualSubmittedAt
    );
    assert.equal(
      new Date(finalSubmission.applicableDeadlineAt).getTime(),
      originalSnapshot.applicableDeadlineAt
    );
    assert.equal(finalSubmission.status, originalSnapshot.status);
    assert.equal(
      finalSubmission.policyVersion,
      originalSnapshot.policyVersion
    );
    assert.deepEqual(finalSubmission.metrics, originalSnapshot.metrics);

    // Verify the expected-day linkage remains unchanged.
    const finalExpected = await ExpectedSubmission.findById(
      expected._id
    ).lean();

    assert.ok(finalExpected);
    assert.equal(finalExpected.status, expectedAfterFirst.status);
    assert.equal(
      String(finalExpected.submissionId),
      String(expectedAfterFirst.submissionId)
    );
    assert.equal(
      new Date(finalExpected.statusEvaluatedAt).getTime(),
      new Date(expectedAfterFirst.statusEvaluatedAt).getTime()
    );

    assert.equal(
      await MetricSubmission.countDocuments({
        employeeId: user._id,
        reportingDate: REPORTING_DATE
      }),
      1
    );
  });
});


test("D. concurrent submission service behavior", async () => {
  await withIntegrationDatabase(async connection => {
    for (const Model of MODELS) {
      await verifyDeclaredIndexes(Model);
    }

    const policy = await createTestSubmissionPolicy({
      overrides: {
        policyVersion: POLICY_VERSION,
        deadlineLocalTime: "09:30",
        timezone: "Asia/Kolkata",
        effectiveStartDate: REPORTING_DATE,
        effectiveEndDate: REPORTING_DATE
      }
    });

    const makeExpectedDay = async user =>
      createTestExpectedSubmission({
        employeeId: user._id,
        reportingDate: REPORTING_DATE,
        deadlineAt: DEADLINE_AT,
        policyVersion: policy.policyVersion
      });

    const makeArguments = (user, metrics, submissionId, model) => ({
      authenticatedUser: { id: String(user._id) },
      request: {
        reportingDate: REPORTING_DATE,
        metrics
      },
      clock: () => new Date(FIXED_SUBMISSION_AT),
      submissionIdFactory: () => submissionId,
      models: {
        MetricSubmission: model
      }
    });

    // --------------------------------------------------
    // D1: Two identical requests submitted concurrently
    // --------------------------------------------------

    const identicalUser = await createTestUser();
    const identicalExpected = await makeExpectedDay(identicalUser);

    const identicalMetrics = {
      ticketsAssigned: 8,
      ticketsResolved: 7,
      slaBreaches: 1,
      reopenedTickets: 2,
      clientInteractions: 5,
      remarks: "Scenario D1 identical concurrent requests"
    };

    const identicalIdA =
      new mongoose.Types.ObjectId("64b0000000000000000000d1");

    const identicalIdB =
      new mongoose.Types.ObjectId("64b0000000000000000000d2");

    for (const submissionId of [identicalIdA, identicalIdB]) {
      registerPlannedTestMetricSubmission({
        connection,
        submissionId,
        employeeId: identicalUser._id,
        reportingDate: REPORTING_DATE,
        actualSubmittedAt: FIXED_SUBMISSION_AT,
        policyVersion: policy.policyVersion
      });
    }

    const identicalBarrier =
      createInitialLookupBarrierMetricSubmissionModel();

    const identicalResults = await Promise.allSettled([
      dailySubmissionService.submitDailySubmission(
        makeArguments(
          identicalUser,
          identicalMetrics,
          identicalIdA,
          identicalBarrier.model
        )
      ),
      dailySubmissionService.submitDailySubmission(
        makeArguments(
          identicalUser,
          identicalMetrics,
          identicalIdB,
          identicalBarrier.model
        )
      )
    ]);

    assert.equal(identicalBarrier.getInitialLookupCount(), 2);

    const identicalFulfilled = identicalResults.filter(
      result => result.status === "fulfilled"
    );

    const identicalRejected = identicalResults.filter(
      result => result.status === "rejected"
    );

    assert.equal(identicalFulfilled.length, 2);
    assert.equal(identicalRejected.length, 0);

    const identicalResponses = identicalFulfilled.map(
      result => result.value
    );

    assert.equal(
      identicalResponses.filter(result => result.data.isReplay === false).length,
      1,
      "Exactly one concurrent request must create the submission."
    );

    assert.equal(
      identicalResponses.filter(result => result.data.isReplay === true).length,
      1,
      "The other identical request must replay the original submission."
    );

    assert.equal(
      identicalResponses[0].data.submissionId,
      identicalResponses[1].data.submissionId
    );

    const identicalPersisted = await MetricSubmission.find({
      employeeId: identicalUser._id,
      reportingDate: REPORTING_DATE
    }).lean();

    assert.equal(identicalPersisted.length, 1);
    assert.deepEqual(
  identicalPersisted[0].metrics,
  identicalMetrics
);

assert.equal(
  new Date(identicalPersisted[0].actualSubmittedAt).getTime(),
  FIXED_SUBMISSION_AT.getTime()
);

assert.equal(
  identicalPersisted[0].policyVersion,
  policy.policyVersion
);

    const identicalExpectedAfter = await ExpectedSubmission.findById(
      identicalExpected._id
    ).lean();

    assert.ok(identicalExpectedAfter);
    assert.equal(
      String(identicalExpectedAfter.submissionId),
      String(identicalPersisted[0]._id)
    );

    assert.equal(
      identicalExpectedAfter.status,
      identicalPersisted[0].status
    );

    // --------------------------------------------------
    // D2: Two conflicting requests submitted concurrently
    // --------------------------------------------------

    const conflictingUser = await createTestUser();
    const conflictingExpected = await makeExpectedDay(conflictingUser);

    const conflictingMetricsA = {
      ticketsAssigned: 6,
      ticketsResolved: 5,
      slaBreaches: 0,
      reopenedTickets: 1,
      clientInteractions: 3,
      remarks: "Scenario D2 concurrent request A"
    };

    const conflictingMetricsB = {
      ticketsAssigned: 9,
      ticketsResolved: 8,
      slaBreaches: 2,
      reopenedTickets: 0,
      clientInteractions: 7,
      remarks: "Scenario D2 concurrent request B"
    };

    const conflictingIdA =
      new mongoose.Types.ObjectId("64b0000000000000000000d3");

    const conflictingIdB =
      new mongoose.Types.ObjectId("64b0000000000000000000d4");

    for (const submissionId of [conflictingIdA, conflictingIdB]) {
      registerPlannedTestMetricSubmission({
        connection,
        submissionId,
        employeeId: conflictingUser._id,
        reportingDate: REPORTING_DATE,
        actualSubmittedAt: FIXED_SUBMISSION_AT,
        policyVersion: policy.policyVersion
      });
    }

    const conflictingBarrier =
      createInitialLookupBarrierMetricSubmissionModel();

    const conflictingResults = await Promise.allSettled([
      dailySubmissionService.submitDailySubmission(
        makeArguments(
          conflictingUser,
          conflictingMetricsA,
          conflictingIdA,
          conflictingBarrier.model
        )
      ),
      dailySubmissionService.submitDailySubmission(
        makeArguments(
          conflictingUser,
          conflictingMetricsB,
          conflictingIdB,
          conflictingBarrier.model
        )
      )
    ]);

    assert.equal(conflictingBarrier.getInitialLookupCount(), 2);

    const conflictingFulfilled = conflictingResults.filter(
      result => result.status === "fulfilled"
    );

    const conflictingRejected = conflictingResults.filter(
      result => result.status === "rejected"
    );

    assert.equal(
      conflictingFulfilled.length,
      1,
      "Exactly one conflicting request must succeed."
    );

    assert.equal(
      conflictingRejected.length,
      1,
      "The other conflicting request must be rejected."
    );

    const conflictError = conflictingRejected[0].reason;

    assert.equal(conflictError.status, 409);
    assert.equal(conflictError.code, "SUBMISSION_CONFLICT");

    const winningResponse = conflictingFulfilled[0].value;
    assert.ok(
    [
    String(conflictingIdA),
    String(conflictingIdB)
    ].includes(winningResponse.data.submissionId),
    "The winning submission must use one of the pre-registered IDs."
    );
    assert.equal(winningResponse.success, true);
    assert.equal(winningResponse.data.isReplay, false);

    const conflictingPersisted = await MetricSubmission.find({
      employeeId: conflictingUser._id,
      reportingDate: REPORTING_DATE
    }).lean();

    assert.equal(conflictingPersisted.length, 1);

    const winningSubmission = conflictingPersisted[0];

    assert.equal(
      String(winningSubmission._id),
      winningResponse.data.submissionId
    );

    const expectedAfterConflict = await ExpectedSubmission.findById(
      conflictingExpected._id
    ).lean();

    assert.ok(expectedAfterConflict);

    assert.equal(
      String(expectedAfterConflict.submissionId),
      String(winningSubmission._id)
    );

    assert.equal(
      expectedAfterConflict.status,
      winningSubmission.status
    );

    const winningMetrics =
      winningResponse.data.submissionId === String(conflictingIdA)
        ? conflictingMetricsA
        : conflictingMetricsB;

    assert.deepEqual(winningSubmission.metrics, winningMetrics);
  });
});


test("E. transaction retry preserves the captured timestamp", async () => {
  await withIntegrationDatabase(async connection => {
    for (const Model of MODELS) {
      await verifyDeclaredIndexes(Model);
    }

    const user = await createTestUser();

    const policy = await createTestSubmissionPolicy({
      overrides: {
        policyVersion: POLICY_VERSION,
        deadlineLocalTime: "09:30",
        timezone: "Asia/Kolkata",
        effectiveStartDate: REPORTING_DATE,
        effectiveEndDate: REPORTING_DATE
      }
    });

    const expected = await createTestExpectedSubmission({
      employeeId: user._id,
      reportingDate: REPORTING_DATE,
      deadlineAt: DEADLINE_AT,
      policyVersion: policy.policyVersion
    });

    const plannedSubmissionId =
      new mongoose.Types.ObjectId("64b0000000000000000000e1");

    const requestMetrics = {
      ticketsAssigned: 10,
      ticketsResolved: 8,
      slaBreaches: 1,
      reopenedTickets: 2,
      clientInteractions: 6,
      remarks: "Scenario E transaction retry test"
    };

    registerPlannedTestMetricSubmission({
      connection,
      submissionId: plannedSubmissionId,
      employeeId: user._id,
      reportingDate: REPORTING_DATE,
      actualSubmittedAt: FIXED_SUBMISSION_AT,
      policyVersion: expected.policyVersion
    });

    let updateAttempts = 0;
    let clockCalls = 0;
    let submissionIdFactoryCalls = 0;
    const transactionStates = [];

    const injectedExpectedSubmissionModel = {
      findOne: (...args) => ExpectedSubmission.findOne(...args),

      updateOne: async (filter, update, options) => {
        updateAttempts += 1;

        const session = options?.session;

        transactionStates.push(
          Boolean(session?.inTransaction?.())
        );

        assert.ok(
          session,
          "ExpectedSubmission update must receive the transaction session."
        );

        assert.equal(
          session.inTransaction(),
          true,
          "ExpectedSubmission update must execute inside an active transaction."
        );

        // Inject one controlled transient failure.
        if (updateAttempts === 1) {
          const error = new mongoose.mongo.MongoServerError({
  message: "Synthetic transient transaction failure for Scenario E.",
  errmsg: "Synthetic transient transaction failure for Scenario E.",
  ok: 0,
});

error.addErrorLabel("TransientTransactionError");

throw error;
        }

        // Subsequent attempts use the real database operation.
        return ExpectedSubmission.updateOne(
          filter,
          update,
          options
        );
      }
    };

    const result =
      await dailySubmissionService.submitDailySubmission({
        authenticatedUser: { id: String(user._id) },

        request: {
          reportingDate: REPORTING_DATE,
          metrics: requestMetrics
        },

        clock: () => {
          clockCalls += 1;

          // A second clock invocation would return a different timestamp.
          return new Date(
            FIXED_SUBMISSION_AT.getTime() +
            (clockCalls - 1) * 60000
          );
        },

        submissionIdFactory: () => {
          submissionIdFactoryCalls += 1;
          return plannedSubmissionId;
        },

        models: {
          ExpectedSubmission: injectedExpectedSubmissionModel
        }
      });

    // Verify that the transaction callback was retried.
    assert.equal(
      updateAttempts,
      2,
      "The transaction callback must execute again after the transient error."
    );

    assert.deepEqual(
      transactionStates,
      [true, true],
      "Both transaction attempts must execute inside an active transaction."
    );

    // The logical submission must retain its original captured values.
    assert.equal(clockCalls, 1);
    assert.equal(submissionIdFactoryCalls, 1);

    assert.equal(result.success, true);
    assert.equal(result.data.isReplay, false);
    assert.equal(
      result.data.submissionId,
      String(plannedSubmissionId)
    );

    // Verify exactly one committed MetricSubmission.
    const persistedSubmissions = await MetricSubmission.find({
      employeeId: user._id,
      reportingDate: REPORTING_DATE
    }).lean();

    assert.equal(
      persistedSubmissions.length,
      1,
      "Only one MetricSubmission must survive the transaction retry."
    );

    const persisted = persistedSubmissions[0];

    assert.equal(String(persisted._id), String(plannedSubmissionId));
    assert.deepEqual(persisted.metrics, requestMetrics);

    assert.equal(
      new Date(persisted.actualSubmittedAt).getTime(),
      FIXED_SUBMISSION_AT.getTime()
    );

    assert.equal(
      new Date(persisted.applicableDeadlineAt).getTime(),
      DEADLINE_AT.getTime()
    );

    assert.equal(persisted.status, "On-Time");
    assert.equal(persisted.policyVersion, policy.policyVersion);

    // Verify the expected-day record was linked atomically.
    const persistedExpected = await ExpectedSubmission.findById(
      expected._id
    ).lean();

    assert.ok(persistedExpected);

    assert.equal(persistedExpected.status, "On-Time");

    assert.equal(
      String(persistedExpected.submissionId),
      String(plannedSubmissionId)
    );

    assert.equal(
      new Date(persistedExpected.statusEvaluatedAt).getTime(),
      FIXED_SUBMISSION_AT.getTime()
    );
  });
});


test("F. unknown commit result reconciles the successfully committed submission", async () => {
  await withIntegrationDatabase(async connection => {
    for (const Model of MODELS) {
      await verifyDeclaredIndexes(Model);
    }

    const user = await createTestUser();

    const policy = await createTestSubmissionPolicy({
      overrides: {
        policyVersion: POLICY_VERSION,
        deadlineLocalTime: "09:30",
        timezone: "Asia/Kolkata",
        effectiveStartDate: REPORTING_DATE,
        effectiveEndDate: REPORTING_DATE
      }
    });

    const expected = await createTestExpectedSubmission({
      employeeId: user._id,
      reportingDate: REPORTING_DATE,
      deadlineAt: DEADLINE_AT,
      policyVersion: policy.policyVersion
    });

    const plannedSubmissionId =
      new mongoose.Types.ObjectId("64b0000000000000000000f1");

    const requestMetrics = {
      ticketsAssigned: 12,
      ticketsResolved: 9,
      slaBreaches: 1,
      reopenedTickets: 2,
      clientInteractions: 7,
      remarks: "Scenario F unknown commit reconciliation test"
    };

    registerPlannedTestMetricSubmission({
      connection,
      submissionId: plannedSubmissionId,
      employeeId: user._id,
      reportingDate: REPORTING_DATE,
      actualSubmittedAt: FIXED_SUBMISSION_AT,
      policyVersion: expected.policyVersion
    });

    const majorityReadCalls = [];

    function trackFindOneReads(Model, modelName) {
      return new Proxy(Model, {
        get(target, property, receiver) {
          if (property !== "findOne") {
            return Reflect.get(target, property, receiver);
          }

          return (...args) => {
            const query = target.findOne(...args);

            const trackedQuery = {
              read: (...readArgs) => {
                majorityReadCalls.push({
                  model: modelName,
                  operation: "read",
                  args: readArgs
                });

                query.read(...readArgs);
                return trackedQuery;
              },

              readConcern: (...readArgs) => {
                majorityReadCalls.push({
                  model: modelName,
                  operation: "readConcern",
                  args: readArgs
                });

                query.readConcern(...readArgs);
                return trackedQuery;
              },

              lean: (...leanArgs) => query.lean(...leanArgs)
            };

            return trackedQuery;
          };
        }
      });
    }

    const trackedMetricSubmission =
      trackFindOneReads(MetricSubmission, "MetricSubmission");

    const trackedExpectedSubmission =
      trackFindOneReads(ExpectedSubmission, "ExpectedSubmission");

    const realSession = await mongoose.startSession();

let transactionCalls = 0;
let transactionCallbackCalls = 0;
let clockCalls = 0;
let submissionIdFactoryCalls = 0;

const injectedSession = new Proxy(realSession, {
  get(target, property) {
    if (property === "withTransaction") {
      return async (...args) => {
        transactionCalls += 1;

        // Execute the actual transaction and let MongoDB commit it.
        const result = await target.withTransaction(
          async (...callbackArgs) => {
            transactionCallbackCalls += 1;
            return args[0](...callbackArgs);
          },
          ...args.slice(1)
        );

        // Inject the unknown acknowledgement only after commit.
        const error = new mongoose.mongo.MongoServerError({
          message: "Synthetic unknown commit result for Scenario F.",
          errmsg: "Synthetic unknown commit result for Scenario F.",
          ok: 0
        });

        error.addErrorLabel("UnknownTransactionCommitResult");

        throw error;
      };
    }

    // Preserve every other real ClientSession method and property.
    const value = Reflect.get(target, property, target);

    return typeof value === "function"
      ? value.bind(target)
      : value;
  }
});

    const injectedMongooseClient = {
      startSession: async () => injectedSession
    };
    const result =
      await dailySubmissionService.submitDailySubmission({
        authenticatedUser: { id: String(user._id) },

        request: {
          reportingDate: REPORTING_DATE,
          metrics: requestMetrics
        },

        clock: () => {
          clockCalls += 1;
          return new Date(FIXED_SUBMISSION_AT);
        },

        submissionIdFactory: () => {
          submissionIdFactoryCalls += 1;
          return plannedSubmissionId;
        },

        mongooseClient: injectedMongooseClient,

        models: {
          MetricSubmission: trackedMetricSubmission,
          ExpectedSubmission: trackedExpectedSubmission
        }
      });

    // Verify the actual transaction executed and committed once.
    assert.equal(transactionCalls, 1);
    assert.equal(transactionCallbackCalls, 1);

    // Verify reconciliation returned the original logical submission.
    assert.equal(result.success, true);
    assert.equal(result.data.isReplay, true);

    assert.equal(
      result.data.submissionId,
      String(plannedSubmissionId)
    );

    assert.equal(clockCalls, 1);
    assert.equal(submissionIdFactoryCalls, 1);

    // Verify primary + majority reconciliation reads.
    for (const modelName of [
      "MetricSubmission",
      "ExpectedSubmission"
    ]) {
      assert.ok(
        majorityReadCalls.some(
          call =>
            call.model === modelName &&
            call.operation === "read" &&
            call.args[0] === "primary"
        ),
        `${modelName} must use primary read preference.`
      );

      assert.ok(
        majorityReadCalls.some(
          call =>
            call.model === modelName &&
            call.operation === "readConcern" &&
            call.args[0] === "majority"
        ),
        `${modelName} must use majority read concern.`
      );
    }

    // Verify exactly one submission was committed.
    const persistedSubmissions = await MetricSubmission.find({
      employeeId: user._id,
      reportingDate: REPORTING_DATE
    }).lean();

    assert.equal(
      persistedSubmissions.length,
      1,
      "Unknown commit reconciliation must not create a duplicate."
    );

    const persisted = persistedSubmissions[0];

    assert.equal(
      String(persisted._id),
      String(plannedSubmissionId)
    );

    assert.deepEqual(persisted.metrics, requestMetrics);

    assert.equal(
      new Date(persisted.actualSubmittedAt).getTime(),
      FIXED_SUBMISSION_AT.getTime()
    );

    assert.equal(
      new Date(persisted.applicableDeadlineAt).getTime(),
      DEADLINE_AT.getTime()
    );

    assert.equal(persisted.status, "On-Time");
    assert.equal(persisted.policyVersion, policy.policyVersion);

    // Verify the original ExpectedSubmission linkage.
    const persistedExpected =
      await ExpectedSubmission.findById(expected._id).lean();

    assert.ok(persistedExpected);
    assert.equal(persistedExpected.status, "On-Time");

    assert.equal(
      String(persistedExpected.submissionId),
      String(plannedSubmissionId)
    );

    assert.equal(
      new Date(persistedExpected.statusEvaluatedAt).getTime(),
      FIXED_SUBMISSION_AT.getTime()
    );
  });
});


test("G. ExpectedSubmission status and submissionId consistency", async () => {
  const employeeId = new mongoose.Types.ObjectId("64b0000000000000000000a2");
  const submissionId = new mongoose.Types.ObjectId("64b0000000000000000000b2");
  const validSubmittedDay = new ExpectedSubmission({
    employeeId,
    reportingDate: REPORTING_DATE,
    expected: true,
    status: "On-Time",
    deadlineAt: DEADLINE_AT,
    policyVersion: POLICY_VERSION,
    submissionId
  });
  await validSubmittedDay.validate();

  await assert.rejects(
    new ExpectedSubmission({
      employeeId,
      reportingDate: REPORTING_DATE,
      expected: true,
      status: "Late",
      deadlineAt: DEADLINE_AT,
      policyVersion: POLICY_VERSION,
      submissionId: null
    }).validate(),
    /must reference a submission/
  );
  await assert.rejects(
    new ExpectedSubmission({
      employeeId,
      reportingDate: REPORTING_DATE,
      expected: true,
      status: "Pending",
      deadlineAt: DEADLINE_AT,
      policyVersion: POLICY_VERSION,
      submissionId
    }).validate(),
    /cannot reference a submission/
  );
});

test("H. saved deadline snapshot determines punctuality and correction evidence stays immutable", () => {
  const savedExpectedDay = {
    deadlineAt: new Date("2026-11-12T04:00:00.000Z"),
    policyVersion: "saved-policy-snapshot-v1"
  };
  assert.equal(classifySubmission(savedExpectedDay.deadlineAt, savedExpectedDay.deadlineAt), "On-Time");
  assert.equal(
    classifySubmission(new Date(savedExpectedDay.deadlineAt.getTime() + 1), savedExpectedDay.deadlineAt),
    "Late"
  );

  const correction = SubmissionCorrection.hydrate({
    submissionId: new mongoose.Types.ObjectId("64b0000000000000000000c2"),
    employeeId: new mongoose.Types.ObjectId("64b0000000000000000000a2"),
    modifiedBy: new mongoose.Types.ObjectId("64b0000000000000000000d2"),
    correctionTimestamp: new Date("2026-11-13T05:00:00.000Z"),
    previousValues: { ticketsAssigned: 5, ticketsResolved: 4, slaBreaches: 0, reopenedTickets: 0, clientInteractions: 2, remarks: "Before" },
    correctedValues: { ticketsAssigned: 5, ticketsResolved: 5, slaBreaches: 0, reopenedTickets: 0, clientInteractions: 2, remarks: "After" },
    correctionReason: "Synthetic test correction",
    originalActualSubmittedAt: new Date("2026-11-12T04:00:00.000Z"),
    originalApplicableDeadlineAt: savedExpectedDay.deadlineAt,
    originalStatus: "On-Time"
  });
  correction.originalActualSubmittedAt = new Date("2026-11-12T08:00:00.000Z");
  correction.originalApplicableDeadlineAt = new Date("2026-11-12T09:30:00.000Z");
  correction.originalStatus = "Late";
  assert.equal(correction.originalActualSubmittedAt.toISOString(), "2026-11-12T04:00:00.000Z");
  assert.equal(correction.originalApplicableDeadlineAt.toISOString(), "2026-11-12T04:00:00.000Z");
  assert.equal(correction.originalStatus, "On-Time");
});
