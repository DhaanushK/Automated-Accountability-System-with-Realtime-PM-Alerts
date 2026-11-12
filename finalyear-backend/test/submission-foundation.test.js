import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../src/models/User.js";
import MetricSubmission from "../src/models/MetricSubmission.js";
import ExpectedSubmission from "../src/models/ExpectedSubmission.js";
import SubmissionAlert from "../src/models/SubmissionAlert.js";
import SubmissionPolicy from "../src/models/SubmissionPolicy.js";
import SubmissionException from "../src/models/SubmissionException.js";
import SubmissionCorrection from "../src/models/SubmissionCorrection.js";
import {
  buildDeadlineInstant,
  classifySubmission,
  evaluateSubmissionDeadline,
  isApprovedExceptionForDate,
  resolveEffectiveSubmissionPolicy
} from "../src/services/submissionPolicyService.js";

const employeeId = new mongoose.Types.ObjectId();
const reportingDate = "2026-11-11";
const validMetrics = {
  ticketsAssigned: 5,
  ticketsResolved: 4,
  slaBreaches: 0,
  reopenedTickets: 1,
  clientInteractions: 3,
  remarks: "Daily summary"
};

function validSubmission(overrides = {}) {
  return new MetricSubmission({
    employeeId,
    reportingDate,
    actualSubmittedAt: new Date("2026-11-11T03:00:00.000Z"),
    applicableDeadlineAt: buildDeadlineInstant(reportingDate, "09:30", "Asia/Kolkata"),
    status: "On-Time",
    metrics: { ...validMetrics },
    policyVersion: "v1",
    ...overrides
  });
}

function validExpected(overrides = {}) {
  return new ExpectedSubmission({
    employeeId,
    reportingDate,
    expected: true,
    status: "Pending",
    deadlineAt: buildDeadlineInstant(reportingDate, "09:30"),
    policyVersion: "v1",
    ...overrides
  });
}

function getUniqueIndex(schema, expectedKeys) {
  return schema.indexes().find(([keys, options]) =>
    options.unique === true &&
    JSON.stringify(Object.keys(keys)) === JSON.stringify(expectedKeys)
  );
}

test("MetricSubmission accepts a valid record and validates required fields", async () => {
  await validSubmission().validate();

  const missing = new MetricSubmission({});
  await assert.rejects(missing.validate(), error => {
    assert.equal(error.name, "ValidationError");
    assert.ok(error.errors.employeeId);
    assert.ok(error.errors.reportingDate);
    assert.ok(error.errors.actualSubmittedAt);
    assert.ok(error.errors.metrics);
    return true;
  });
});

test("MetricSubmission rejects negative, fractional and oversized metric values", async () => {
  await assert.rejects(
    validSubmission({ metrics: { ...validMetrics, ticketsAssigned: -1 } }).validate(),
    error => error.name === "ValidationError"
  );
  await assert.rejects(
    validSubmission({ metrics: { ...validMetrics, ticketsResolved: 1.5 } }).validate(),
    error => error.name === "ValidationError"
  );
  await assert.rejects(
    validSubmission({ metrics: { ...validMetrics, remarks: "x".repeat(1001) } }).validate(),
    error => error.name === "ValidationError"
  );
});

test("MetricSubmission rejects invalid reporting dates and statuses", async () => {
  await assert.rejects(
    validSubmission({ reportingDate: "2026-02-30" }).validate(),
    error => error.name === "ValidationError"
  );
  await assert.rejects(
    validSubmission({ status: "Pending" }).validate(),
    error => error.name === "ValidationError"
  );
});

test("MetricSubmission declares employee/date uniqueness and query indexes", () => {
  assert.ok(getUniqueIndex(MetricSubmission.schema, ["employeeId", "reportingDate"]));
  assert.ok(MetricSubmission.schema.indexes().some(([keys]) =>
    keys.reportingDate === 1 && keys.status === 1
  ));
  assert.ok(MetricSubmission.schema.indexes().some(([keys]) =>
    keys.employeeId === 1 && keys.reportingDate === -1
  ));
});

test("ExpectedSubmission supports valid expected and excluded states only", async () => {
  await validExpected().validate();
  await validExpected({
    expected: false,
    status: "Excluded",
    reasonCode: "HOLIDAY"
  }).validate();

  await assert.rejects(
    validExpected({ expected: false, status: "Pending", reasonCode: "LEAVE" }).validate(),
    /Non-expected employee-days must have Excluded status/
  );
  await assert.rejects(
    validExpected({ expected: false, status: "Excluded" }).validate(),
    /Excluded employee-days require an exclusion reason/
  );
  await assert.rejects(
    validExpected({ status: "Unrecognized" }).validate(),
    error => error.name === "ValidationError"
  );
});

test("ExpectedSubmission declares employee/date uniqueness", () => {
  assert.ok(getUniqueIndex(ExpectedSubmission.schema, ["employeeId", "reportingDate"]));
});

test("SubmissionAlert validates delivery fields and declares idempotency uniqueness", async () => {
  const alert = new SubmissionAlert({
    employeeId,
    reportingDate,
    expectedSubmissionId: new mongoose.Types.ObjectId(),
    alertType: "MISSING",
    triggerTimestamp: new Date(),
    recipientUserId: new mongoose.Types.ObjectId(),
    idempotencyKey: "expected:missing:recipient"
  });
  await alert.validate();

  assert.ok(getUniqueIndex(SubmissionAlert.schema, ["idempotencyKey"]));
  await assert.rejects(
    new SubmissionAlert({
      employeeId,
      reportingDate,
      expectedSubmissionId: new mongoose.Types.ObjectId(),
      alertType: "INVALID",
      triggerTimestamp: new Date(),
      recipientUserId: new mongoose.Types.ObjectId(),
      idempotencyKey: "bad"
    }).validate(),
    error => error.name === "ValidationError"
  );
});

test("SubmissionPolicy validates defaults, date range and timezone", async () => {
  const policy = new SubmissionPolicy({
    policyVersion: "policy-test",
    effectiveStartDate: reportingDate
  });
  await policy.validate();
  assert.equal(policy.deadlineLocalTime, "09:30");
  assert.equal(policy.timezone, "Asia/Kolkata");
  assert.deepEqual(policy.workingWeekdays, [1, 2, 3, 4, 5]);

  await assert.rejects(
    new SubmissionPolicy({
      policyVersion: "bad-range",
      effectiveStartDate: "2026-11-12",
      effectiveEndDate: "2026-11-11"
    }).validate(),
    /effectiveEndDate cannot precede effectiveStartDate/
  );
  await assert.rejects(
    new SubmissionPolicy({
      policyVersion: "bad-zone",
      effectiveStartDate: reportingDate,
      timezone: "Not/AZone"
    }).validate(),
    error => error.name === "ValidationError"
  );
});

test("effective policy lookup selects only the matching active policy", async () => {
  const rows = [
    {
      policyVersion: "old",
      active: true,
      effectiveStartDate: "2026-01-01",
      effectiveEndDate: "2026-11-10"
    },
    {
      policyVersion: "current",
      active: true,
      effectiveStartDate: "2026-11-11",
      effectiveEndDate: null,
      deadlineLocalTime: "09:30",
      timezone: "Asia/Kolkata"
    }
  ];
  const fakeModel = {
    find: filter => ({
      lean: async () => rows.filter(row =>
        row.active === filter.active &&
        row.effectiveStartDate <= filter.effectiveStartDate.$lte &&
        (row.effectiveEndDate === null ||
          row.effectiveEndDate >= filter.$or[1].effectiveEndDate.$gte)
      )
    })
  };

  assert.equal(
    (await resolveEffectiveSubmissionPolicy(reportingDate, { policyModel: fakeModel })).policyVersion,
    "current"
  );
  await assert.rejects(
    resolveEffectiveSubmissionPolicy("2025-01-01", { policyModel: fakeModel }),
    /No active submission policy/
  );
});

test("effective policy evaluation uses the injected server clock", async () => {
  const fakeModel = {
    find: () => ({
      lean: async () => [{
        policyVersion: "v1",
        deadlineLocalTime: "09:30",
        timezone: "Asia/Kolkata"
      }]
    })
  };
  const result = await evaluateSubmissionDeadline(reportingDate, {
    policyModel: fakeModel,
    clock: () => new Date("2026-11-11T03:00:00.000Z")
  });
  assert.equal(result.status, "On-Time");
  assert.equal(result.applicableDeadlineAt.toISOString(), "2026-11-11T04:00:00.000Z");
});

test("only approved exceptions covering a date are eligible for exclusion", () => {
  const exception = {
    employeeId,
    exceptionType: "Leave",
    approvalStatus: "Approved",
    startDate: "2026-11-10",
    endDate: "2026-11-12"
  };
  assert.equal(isApprovedExceptionForDate(exception, reportingDate, employeeId), true);
  assert.equal(isApprovedExceptionForDate({ ...exception, approvalStatus: "Pending" }, reportingDate, employeeId), false);
  assert.equal(isApprovedExceptionForDate(exception, "2026-11-13", employeeId), false);
});

test("SubmissionException requires approval metadata before an exception is approved", async () => {
  const approved = new SubmissionException({
    employeeId,
    startDate: reportingDate,
    endDate: reportingDate,
    exceptionType: "Leave",
    reason: "Approved leave",
    approvalStatus: "Approved",
    approvedBy: new mongoose.Types.ObjectId(),
    approvedAt: new Date()
  });
  await approved.validate();

  await assert.rejects(
    new SubmissionException({
      employeeId,
      startDate: reportingDate,
      endDate: reportingDate,
      exceptionType: "Leave",
      reason: "Pending leave",
      approvalStatus: "Pending",
      approvedBy: new mongoose.Types.ObjectId(),
      approvedAt: new Date()
    }).validate(),
    /Only approved exceptions may contain approval metadata/
  );
});

test("SubmissionCorrection retains immutable punctuality evidence", async () => {
  const correction = new SubmissionCorrection({
    submissionId: new mongoose.Types.ObjectId(),
    employeeId,
    modifiedBy: new mongoose.Types.ObjectId(),
    correctionTimestamp: new Date("2026-11-12T04:00:00.000Z"),
    previousValues: { ...validMetrics },
    correctedValues: { ...validMetrics, ticketsResolved: 5 },
    correctionReason: "Corrected count",
    originalActualSubmittedAt: new Date("2026-11-11T03:00:00.000Z"),
    originalApplicableDeadlineAt: new Date("2026-11-11T04:00:00.000Z"),
    originalStatus: "On-Time"
  });
  await correction.validate();

  const hydrated = SubmissionCorrection.hydrate(correction.toObject());
  hydrated.originalActualSubmittedAt = new Date("2026-11-12T08:00:00.000Z");
  hydrated.originalApplicableDeadlineAt = new Date("2026-11-12T09:30:00.000Z");
  hydrated.originalStatus = "Late";
  assert.equal(hydrated.originalActualSubmittedAt.toISOString(), "2026-11-11T03:00:00.000Z");
  assert.equal(hydrated.originalApplicableDeadlineAt.toISOString(), "2026-11-11T04:00:00.000Z");
  assert.equal(hydrated.originalStatus, "On-Time");
});

test("deadline utility classifies 09:00, 09:29, equality, and 09:31 IST correctly", () => {
  const deadline = buildDeadlineInstant(reportingDate, "09:30", "Asia/Kolkata");
  assert.equal(deadline.toISOString(), "2026-11-11T04:00:00.000Z");
  assert.equal(classifySubmission(new Date("2026-11-11T03:30:00.000Z"), deadline), "On-Time");
  assert.equal(classifySubmission(new Date("2026-11-11T03:59:00.000Z"), deadline), "On-Time");
  assert.equal(classifySubmission(deadline, deadline), "On-Time");
  assert.equal(classifySubmission(new Date("2026-11-11T04:01:00.000Z"), deadline), "Late");
});

test("deadline conversion is independent of the host operating-system timezone", () => {
  const originalTZ = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(
      buildDeadlineInstant(reportingDate, "09:30", "Asia/Kolkata").toISOString(),
      "2026-11-11T04:00:00.000Z"
    );
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
});

test("deadline helper rejects invalid dates, times and timezones", () => {
  assert.throws(() => buildDeadlineInstant("2026-02-30", "09:30"), /reportingDate/);
  assert.throws(() => buildDeadlineInstant(reportingDate, "25:00"), /localTime/);
  assert.throws(() => buildDeadlineInstant(reportingDate, "09:30", "Invalid/Zone"), /timezone/);
});


test("User roster metadata is optional and migration-safe", () => {
  assert.equal(User.schema.path("active").defaultValue, false);
  assert.equal(User.schema.path("teamId").defaultValue, null);
  assert.equal(User.schema.path("managerId").defaultValue, null);
  assert.equal(User.schema.path("employmentStartDate").defaultValue, null);
  assert.equal(User.schema.path("employmentEndDate").defaultValue, null);
  assert.equal(User.schema.path("name").isRequired, true);
  assert.equal(User.schema.path("email").isRequired, true);
  assert.equal(User.schema.path("password").isRequired, true);
  assert.equal(User.schema.path("role").isRequired, true);
});

test("effective policy resolver fails closed on overlapping active versions", async () => {
  const fakeModel = {
    find: () => ({
      lean: async () => [
        { policyVersion: "v1" },
        { policyVersion: "v2" }
      ]
    })
  };
  await assert.rejects(
    resolveEffectiveSubmissionPolicy(reportingDate, { policyModel: fakeModel }),
    /Multiple active submission policies/
  );
});



test("ExpectedSubmission requires a submission reference exactly for submitted states", async () => {
  const submissionId = new mongoose.Types.ObjectId();

  await validExpected({ status: "On-Time", submissionId }).validate();
  await validExpected({ status: "Late", submissionId }).validate();

  for (const status of ["On-Time", "Late"]) {
    await assert.rejects(
      validExpected({ status, submissionId: null }).validate(),
      /must reference a submission/
    );
  }
  for (const status of ["Pending", "Missing", "Excluded"]) {
    await assert.rejects(
      validExpected({
        expected: status !== "Excluded",
        status,
        reasonCode: status === "Excluded" ? "HOLIDAY" : null,
        submissionId
      }).validate(),
      /cannot reference a submission/
    );
  }
  await assert.rejects(
    validExpected({ status: "Late", submissionId: "not-an-object-id" }).validate(),
    error => error.name === "ValidationError"
  );
});

test("employee-specific leave and exemption never exclude another employee", () => {
  const employeeA = new mongoose.Types.ObjectId();
  const employeeB = new mongoose.Types.ObjectId();
  const leave = {
    employeeId: employeeA,
    exceptionType: "Leave",
    approvalStatus: "Approved",
    startDate: reportingDate,
    endDate: reportingDate
  };
  const exemption = { ...leave, exceptionType: "Exemption" };

  assert.equal(isApprovedExceptionForDate(leave, reportingDate, employeeA), true);
  assert.equal(isApprovedExceptionForDate(leave, reportingDate, employeeB), false);
  assert.equal(isApprovedExceptionForDate(exemption, reportingDate, employeeA), true);
  assert.equal(isApprovedExceptionForDate(exemption, reportingDate, employeeB), false);
});

test("organization-wide approved holidays may apply to all employees", () => {
  const employeeA = new mongoose.Types.ObjectId();
  const employeeB = new mongoose.Types.ObjectId();
  const globalHoliday = {
    employeeId: null,
    exceptionType: "Holiday",
    approvalStatus: "Approved",
    startDate: reportingDate,
    endDate: reportingDate
  };
  const employeeHoliday = { ...globalHoliday, employeeId: employeeA };

  assert.equal(isApprovedExceptionForDate(globalHoliday, reportingDate, employeeA), true);
  assert.equal(isApprovedExceptionForDate(globalHoliday, reportingDate, employeeB), true);
  assert.equal(isApprovedExceptionForDate(employeeHoliday, reportingDate, employeeA), true);
  assert.equal(isApprovedExceptionForDate(employeeHoliday, reportingDate, employeeB), false);
  assert.equal(
    isApprovedExceptionForDate({ ...globalHoliday, approvalStatus: "Pending" }, reportingDate, employeeA),
    false
  );
});

test("correction reason and original punctuality evidence are immutable after request creation", async () => {
  const correction = new SubmissionCorrection({
    submissionId: new mongoose.Types.ObjectId(),
    employeeId,
    modifiedBy: new mongoose.Types.ObjectId(),
    correctionTimestamp: new Date("2026-11-12T04:00:00.000Z"),
    previousValues: { ...validMetrics },
    correctedValues: { ...validMetrics, ticketsResolved: 5 },
    correctionReason: "Original reason",
    originalActualSubmittedAt: new Date("2026-11-11T03:00:00.000Z"),
    originalApplicableDeadlineAt: new Date("2026-11-11T04:00:00.000Z"),
    originalStatus: "On-Time"
  });
  await correction.validate();

  const persisted = SubmissionCorrection.hydrate(correction.toObject());
  persisted.correctionReason = "Changed reason";
  persisted.originalActualSubmittedAt = new Date("2026-11-12T08:00:00.000Z");
  persisted.originalApplicableDeadlineAt = new Date("2026-11-12T09:30:00.000Z");
  persisted.originalStatus = "Late";
  assert.equal(persisted.correctionReason, "Original reason");
  assert.equal(persisted.originalActualSubmittedAt.toISOString(), "2026-11-11T03:00:00.000Z");
  assert.equal(persisted.originalApplicableDeadlineAt.toISOString(), "2026-11-11T04:00:00.000Z");
  assert.equal(persisted.originalStatus, "On-Time");
});

test("corrections cannot be self-approved", async () => {
  const actorId = new mongoose.Types.ObjectId();
  const correction = new SubmissionCorrection({
    submissionId: new mongoose.Types.ObjectId(),
    employeeId,
    modifiedBy: actorId,
    correctionTimestamp: new Date(),
    previousValues: { ...validMetrics },
    correctedValues: { ...validMetrics },
    correctionReason: "Correction request",
    approvalStatus: "Approved",
    approvedBy: actorId,
    approvedAt: new Date(),
    originalActualSubmittedAt: new Date("2026-11-11T03:00:00.000Z"),
    originalApplicableDeadlineAt: new Date("2026-11-11T04:00:00.000Z"),
    originalStatus: "On-Time"
  });

  await assert.rejects(correction.validate(), /cannot be approved by its modifier/);
});

test("correction approval requires an existing Team Lead or Project Manager", async () => {
  const originalFindById = User.findById;
  const actorId = new mongoose.Types.ObjectId();
  const approverId = new mongoose.Types.ObjectId();
  const correction = new SubmissionCorrection({
    submissionId: new mongoose.Types.ObjectId(),
    employeeId,
    modifiedBy: actorId,
    correctionTimestamp: new Date(),
    previousValues: { ...validMetrics },
    correctedValues: { ...validMetrics },
    correctionReason: "Correction request",
    approvalStatus: "Approved",
    approvedBy: approverId,
    approvedAt: new Date(),
    originalActualSubmittedAt: new Date("2026-11-11T03:00:00.000Z"),
    originalApplicableDeadlineAt: new Date("2026-11-11T04:00:00.000Z"),
    originalStatus: "On-Time"
  });

  try {
    User.findById = () => ({
      select: () => ({ lean: async () => ({ role: "team_member" }) })
    });
    await assert.rejects(correction.validate(), /Only an existing Team Lead or Project Manager/);

    User.findById = () => ({
      select: () => ({ lean: async () => ({ role: "team_lead" }) })
    });
    await correction.validate();
  } finally {
    User.findById = originalFindById;
  }
});

test("DST fall-back ambiguity and spring-forward gaps are rejected", () => {
  assert.throws(
    () => buildDeadlineInstant("2026-11-01", "01:30", "America/New_York"),
    /ambiguous/
  );
  assert.throws(
    () => buildDeadlineInstant("2026-03-08", "02:30", "America/New_York"),
    /does not exist/
  );
  assert.equal(
    buildDeadlineInstant("2026-11-11", "09:30", "Asia/Kolkata").toISOString(),
    "2026-11-11T04:00:00.000Z"
  );
});

test("exception evaluation requires a target employee", () => {
  const globalHoliday = {
    employeeId: null,
    exceptionType: "Holiday",
    approvalStatus: "Approved",
    startDate: reportingDate,
    endDate: reportingDate
  };
  assert.equal(isApprovedExceptionForDate(globalHoliday, reportingDate), false);
});
