import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { submitDailySubmission } from "../src/services/dailySubmissionService.js";

const reportingDate = "2026-11-12";
const employeeId = new mongoose.Types.ObjectId("64b000000000000000000001");
const deadlineAt = new Date("2026-11-12T04:00:00.000Z");
const metrics = {
  ticketsAssigned: 4,
  ticketsResolved: 3,
  slaBreaches: 0,
  reopenedTickets: 1,
  clientInteractions: 2,
  remarks: "Routine test"
};

function submittedRecord(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    employeeId,
    reportingDate,
    actualSubmittedAt: new Date("2026-11-12T02:00:00.000Z"),
    applicableDeadlineAt: deadlineAt,
    status: "On-Time",
    policyVersion: "policy-v1",
    metrics: { ...metrics },
    ...overrides
  };
}

function expectedFor(submission, overrides = {}) {
  return {
    expected: true,
    employeeId,
    reportingDate,
    status: submission.status,
    submissionId: submission._id,
    statusEvaluatedAt: submission.actualSubmittedAt,
    deadlineAt: submission.applicableDeadlineAt,
    policyVersion: submission.policyVersion,
    ...overrides
  };
}

function query(value) {
  const q = {
    select() { return this; },
    read() { return this; },
    readConcern() { return this; },
    session() { return this; },
    lean: async () => typeof value === "function" ? value() : value
  };
  return q;
}

function setup({ existing = null, expectedOverrides = {}, policyOverride = {}, clock = () => new Date("2026-11-12T02:00:00.000Z"), retry = false, matchedCount = 1, unknownCommit = false, unknownCommitExpectedOverride = {}, duplicateKey = false, duplicateExpected = {} } = {}) {
  const expected = {
    _id: new mongoose.Types.ObjectId("64b000000000000000000002"),
    employeeId,
    reportingDate,
    expected: true,
    status: "Pending",
    submissionId: null,
    deadlineAt,
    policyVersion: "policy-v1",
    statusEvaluatedAt: null,
    ...expectedOverrides
  };
  const saved = [];
  const updates = [];
  let clockCalls = 0;
  let attempts = 0;
  let sessionsStarted = 0;
  let sessionsEnded = 0;
  class MetricModel {
    constructor(document) { Object.assign(this, document); }
    async save({ session }) {
      assert.ok(session);
      saved.push({ _id: this._id, actualSubmittedAt: this.actualSubmittedAt, document: this });
      if (duplicateKey) {
        Object.assign(expected, duplicateExpected);
        const error = new Error("simulated duplicate key");
        error.code = 11000;
        error.name = "MongoServerError";
        throw error;
      }
      if (retry && attempts === 1) {
        const error = new Error("simulated transient transaction error");
        error.errorLabels = ["TransientTransactionError"];
        throw error;
      }
      return this;
    }
    static findOne() { return query(typeof existing === "function" ? existing(saved) : existing); }
  }
  const expectedModel = {
    findOne: () => query(expected),
    updateOne: async (filter, update, options) => {
      assert.ok(options.session);
      updates.push({ filter, update });
      if (matchedCount === 1) Object.assign(expected, update.$set);
      return { matchedCount };
    }
  };
  const models = {
    User: { findById: () => query({
      _id: employeeId,
      role: "team_member",
      active: true,
      employmentStartDate: "2026-01-01",
      employmentEndDate: null
    }) },
    MetricSubmission: MetricModel,
    ExpectedSubmission: expectedModel,
    SubmissionPolicy: {
      findOne: () => query({
        policyVersion: "policy-v1",
        effectiveStartDate: "2026-01-01",
        effectiveEndDate: null,
        deadlineLocalTime: "09:30",
        timezone: "Asia/Kolkata",
        active: false,
        ...policyOverride
      }),
      find: () => ({ lean: async () => [{
        policyVersion: "policy-v1",
        effectiveStartDate: "2026-01-01",
        effectiveEndDate: null,
        deadlineLocalTime: "09:30",
        timezone: "Asia/Kolkata",
        active: false,
        ...policyOverride
      }] })
    }
  };
  const client = {
    startSession: async () => {
      sessionsStarted += 1;
      return {
        withTransaction: async callback => {
          do {
            attempts += 1;
            try {
              const result = await callback();
              if (unknownCommit) {
                Object.assign(expected, unknownCommitExpectedOverride);
                const error = new Error("simulated unknown commit result");
                error.errorLabels = ["UnknownTransactionCommitResult"];
                throw error;
              }
              return result;
            }
            catch (error) {
              if (retry && error.errorLabels?.includes("TransientTransactionError") && attempts === 1) continue;
              throw error;
            }
          } while (true);
        },
        endSession: async () => { sessionsEnded += 1; }
      };
    }
  };
  return {
    models,
    client,
    saved,
    updates,
    get attempts() { return attempts; },
    get sessionsStarted() { return sessionsStarted; },
    get sessionsEnded() { return sessionsEnded; },
    clock: () => { clockCalls += 1; return clock(); },
    get clockCalls() { return clockCalls; }
  };
}

const args = (fixture, overrides = {}) => ({
  authenticatedUser: { id: String(employeeId) },
  request: { reportingDate, metrics },
  clock: fixture.clock,
  models: fixture.models,
  mongooseClient: fixture.client,
  ...overrides
});

test("default submission ID factory returns a MongoDB ObjectId", async () => {
  const fixture = setup();
  const result = await submitDailySubmission(args(fixture));

  assert.ok(fixture.saved[0]._id instanceof mongoose.Types.ObjectId);
  assert.equal(result.data.submissionId, String(fixture.saved[0]._id));
  assert.equal(String(fixture.updates[0].update.$set.submissionId), String(fixture.saved[0]._id));
});

test("new submission accepts an inactive historical policy and atomically links the expected row", async () => {
  const fixture = setup();
  const result = await submitDailySubmission(args(fixture));

  assert.equal(result.success, true);
  assert.equal(result.data.isReplay, false);
  assert.equal(result.data.status, "On-Time");
  assert.equal(fixture.clockCalls, 1);
  assert.equal(fixture.saved.length, 1);
  assert.equal(fixture.updates.length, 1);
  assert.equal(String(fixture.saved[0]._id), String(fixture.updates[0].update.$set.submissionId));
  assert.equal(fixture.saved[0].actualSubmittedAt.toISOString(), "2026-11-12T02:00:00.000Z");
  assert.equal(fixture.updates[0].filter.policyVersion, "policy-v1");
  assert.equal(fixture.sessionsEnded, 1);
});

test("injected submission ObjectId stays stable across transaction retry attempts", async () => {
  const fixture = setup({ retry: true });
  const plannedId = new mongoose.Types.ObjectId("64b0000000000000000000e1");
  let factoryCalls = 0;
  const result = await submitDailySubmission(args(fixture, {
    submissionIdFactory: () => {
      factoryCalls += 1;
      return plannedId;
    }
  }));

  assert.equal(result.data.isReplay, false);
  assert.equal(factoryCalls, 1);
  assert.equal(fixture.attempts, 2);
  assert.equal(fixture.clockCalls, 1);
  assert.equal(fixture.saved.length, 2);
  assert.ok(fixture.saved.every(attempt => attempt._id.equals(plannedId)));
  assert.equal(String(fixture.saved[0]._id), String(fixture.saved[1]._id));
  assert.equal(fixture.saved[0].actualSubmittedAt.getTime(), fixture.saved[1].actualSubmittedAt.getTime());
  assert.equal(String(fixture.updates[0].update.$set.submissionId), String(fixture.saved[0]._id));
  assert.equal(fixture.sessionsEnded, 1);
});

test("an existing submission is checked for expected-row integrity before payload comparison", async () => {
  const existing = submittedRecord();
  const fixture = setup({ existing, expectedOverrides: expectedFor(existing, { status: "Late" }) });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
  assert.equal(fixture.clockCalls, 0);
});

test("existing submission integrity rejects expected !== true", async () => {
  const existing = submittedRecord();
  const fixture = setup({ existing, expectedOverrides: expectedFor(existing, { expected: false }) });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("existing submission integrity rejects employee or reporting-date mismatch", async () => {
  const existing = submittedRecord();
  const wrongEmployee = setup({ existing, expectedOverrides: expectedFor(existing, { employeeId: new mongoose.Types.ObjectId() }) });
  await assert.rejects(submitDailySubmission(args(wrongEmployee)), error => error.code === "DATA_INTEGRITY_ERROR");

  const wrongDate = setup({ existing, expectedOverrides: expectedFor(existing, { reportingDate: "2026-11-11" }) });
  await assert.rejects(submitDailySubmission(args(wrongDate)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("existing submission integrity rejects a missing submission reference", async () => {
  const existing = submittedRecord();
  const fixture = setup({ existing, expectedOverrides: expectedFor(existing, { submissionId: null }) });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("existing submission integrity rejects a mismatched submission reference", async () => {
  const existing = submittedRecord();
  const fixture = setup({ existing, expectedOverrides: expectedFor(existing, { submissionId: new mongoose.Types.ObjectId() }) });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("existing submission integrity rejects statusEvaluatedAt mismatch", async () => {
  const existing = submittedRecord();
  const fixture = setup({ existing, expectedOverrides: expectedFor(existing, {
    statusEvaluatedAt: new Date("2026-11-12T02:00:01.000Z")
  }) });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("existing submission integrity rejects deadline mismatch", async () => {
  const existing = submittedRecord();
  const fixture = setup({ existing, expectedOverrides: expectedFor(existing, {
    deadlineAt: new Date(deadlineAt.getTime() + 1000)
  }) });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("existing submission integrity rejects policy-version mismatch", async () => {
  const existing = submittedRecord();
  const fixture = setup({ existing, expectedOverrides: expectedFor(existing, { policyVersion: "other-policy" }) });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("existing submission integrity rejects status inconsistent with its timestamps", async () => {
  const existing = submittedRecord({ status: "Late" });
  const fixture = setup({ existing, expectedOverrides: expectedFor(existing) });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("ExpectedSubmission On-Time without MetricSubmission is a data-integrity error", async () => {
  const fixture = setup({ expectedOverrides: { status: "On-Time" } });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("ExpectedSubmission Late without MetricSubmission is a data-integrity error", async () => {
  const fixture = setup({ expectedOverrides: { status: "Late" } });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("ExpectedSubmission Missing without MetricSubmission is not eligible", async () => {
  const fixture = setup({ expectedOverrides: { status: "Missing" } });
  await assert.rejects(submitDailySubmission(args(fixture)), error =>
    error.status === 409 && error.code === "SUBMISSION_NOT_ALLOWED"
  );
});

test("ExpectedSubmission Excluded without MetricSubmission is not eligible", async () => {
  const fixture = setup({ expectedOverrides: { expected: false, status: "Excluded" } });
  await assert.rejects(submitDailySubmission(args(fixture)), error =>
    error.status === 409 && error.code === "SUBMISSION_NOT_ALLOWED"
  );
});

test("Pending ExpectedSubmission with a dangling submissionId is a data-integrity error", async () => {
  const fixture = setup({ expectedOverrides: { submissionId: new mongoose.Types.ObjectId() } });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("non-expected Pending day without a submission is rejected before writes or transaction", async () => {
  const fixture = setup({ expectedOverrides: { expected: false, status: "Pending", submissionId: null } });
  await assert.rejects(submitDailySubmission(args(fixture)), error =>
    error.status === 409 && error.code === "SUBMISSION_NOT_ALLOWED"
  );
  assert.equal(fixture.saved.length, 0);
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.sessionsStarted, 0);
});

test("MetricSubmission employeeId mismatch is a data-integrity error", async () => {
  const existing = submittedRecord({ employeeId: new mongoose.Types.ObjectId() });
  const fixture = setup({ existing, expectedOverrides: expectedFor(existing) });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("MetricSubmission reportingDate mismatch is a data-integrity error", async () => {
  const existing = submittedRecord({ reportingDate: "2026-11-11" });
  const fixture = setup({ existing, expectedOverrides: expectedFor(existing) });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "DATA_INTEGRITY_ERROR");
});

test("an identical existing submission replays without checking current eligibility", async () => {
  const existing = {
    _id: new mongoose.Types.ObjectId(),
    employeeId,
    reportingDate,
    actualSubmittedAt: new Date("2026-11-12T02:00:00.000Z"),
    applicableDeadlineAt: deadlineAt,
    status: "On-Time",
    policyVersion: "policy-v1",
    metrics: { ...metrics }
  };
  const fixture = setup({ existing, expectedOverrides: {
    status: "On-Time",
    submissionId: existing._id,
    statusEvaluatedAt: existing.actualSubmittedAt
  } });
  fixture.models.User.findById = () => query({
    _id: employeeId,
    role: "team_member",
    active: false,
    employmentStartDate: "2026-01-01",
    employmentEndDate: "2026-11-11"
  });
  const result = await submitDailySubmission(args(fixture));
  assert.equal(result.data.isReplay, true);
  assert.equal(result.data.submissionId, String(existing._id));
  assert.equal(fixture.clockCalls, 0);
});

test("a concurrent ExpectedSubmission change aborts without a standalone write", async () => {
  const fixture = setup({ matchedCount: 0 });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "EXPECTED_SUBMISSION_STATE_CHANGED");
  assert.equal(fixture.saved.length, 1);
  assert.equal(fixture.updates.length, 1);
  assert.equal(fixture.sessionsEnded, 1);
});

test("unknown commit reconciliation confirms only the matching stable submission ID", async () => {
  const fixture = setup({
    unknownCommit: true,
    existing: saved => saved.at(-1)?.document || null
  });
  const result = await submitDailySubmission(args(fixture));
  assert.equal(result.data.isReplay, true);
  assert.equal(result.data.submissionId, String(fixture.saved[0]._id));
  assert.equal(fixture.clockCalls, 1);
  assert.equal(fixture.sessionsEnded, 1);
});

test("policy outside its effective date range is rejected", async () => {
  const fixture = setup({ policyOverride: { effectiveStartDate: "2026-11-13" } });
  await assert.rejects(submitDailySubmission(args(fixture)), error => error.code === "POLICY_SNAPSHOT_INVALID");
  assert.equal(fixture.saved.length, 0);
  assert.equal(fixture.sessionsEnded, 0);
});

test("unavailable unknown-commit reconciliation read returns outcome unconfirmed", async () => {
  let reads = 0;
  const fixture = setup({
    unknownCommit: true,
    existing: () => {
      reads += 1;
      if (reads === 1) return null;
      throw new Error("simulated unavailable reconciliation read");
    }
  });
  await assert.rejects(submitDailySubmission(args(fixture)), error =>
    error.status === 503 && error.code === "SUBMISSION_OUTCOME_UNCONFIRMED"
  );
  assert.equal(fixture.sessionsEnded, 1);
});

test("confirmed integrity failure during unknown-commit reconciliation stays a 500", async () => {
  const fixture = setup({
    unknownCommit: true,
    existing: saved => saved.at(-1)?.document || null,
    unknownCommitExpectedOverride: { statusEvaluatedAt: new Date("2026-11-12T02:00:01.000Z") }
  });
  await assert.rejects(submitDailySubmission(args(fixture)), error =>
    error.status === 500 && error.code === "DATA_INTEGRITY_ERROR"
  );
  assert.equal(fixture.sessionsEnded, 1);
});

test("duplicate-key reconciliation replays a consistent identical competing request", async () => {
  const competingId = new mongoose.Types.ObjectId();
  const competingSubmission = {
    _id: competingId,
    employeeId,
    reportingDate,
    actualSubmittedAt: new Date("2026-11-12T02:00:00.000Z"),
    applicableDeadlineAt: deadlineAt,
    status: "On-Time",
    policyVersion: "policy-v1",
    metrics: { ...metrics }
  };
  let reads = 0;
  const fixture = setup({
    duplicateKey: true,
    existing: () => (++reads === 1 ? null : competingSubmission),
    duplicateExpected: {
      status: "On-Time",
      submissionId: competingId,
      statusEvaluatedAt: competingSubmission.actualSubmittedAt
    }
  });
  const result = await submitDailySubmission(args(fixture));
  assert.equal(result.data.isReplay, true);
  assert.equal(result.data.submissionId, String(competingId));
  assert.equal(fixture.sessionsEnded, 1);
});
