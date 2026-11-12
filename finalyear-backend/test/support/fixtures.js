import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import User from "../../src/models/User.js";
import SubmissionPolicy from "../../src/models/SubmissionPolicy.js";
import ExpectedSubmission from "../../src/models/ExpectedSubmission.js";
import MetricSubmission from "../../src/models/MetricSubmission.js";
import {
  APPROVED_DATABASE_NAME,
  assertIntegrationFixtureConnection,
  registerIntegrationFixture
} from "./mongoIntegration.js";

function assertModelUsesVerifiedConnection(Model) {
  assertIntegrationFixtureConnection(Model.db);
  if (Model.db.name !== APPROVED_DATABASE_NAME) {
    throw new Error("Fixture model is not bound to the approved integration database.");
  }
}

export async function createTestUser({ overrides = {} } = {}) {
  assertModelUsesVerifiedConnection(User);
  const runId = randomUUID();
  const baseEmail = overrides.email || "phase3b.integration.employee@example.invalid";
  const [localPart, domain] = baseEmail.split("@");
  const email = domain ? `${localPart}+${runId}@${domain}` : `phase3b.integration.${runId}@example.invalid`;
  const fixture = {
    _id: overrides._id || new mongoose.Types.ObjectId(),
    name: "Synthetic Integration Employee",
    email,
    password: "TEST_ONLY_NOT_FOR_AUTHENTICATION",
    role: "team_member",
    active: true,
    teamId: "TEST_TEAM_ONLY",
    managerId: null,
    employmentStartDate: "2026-01-01",
    employmentEndDate: null,
    ...overrides
  };
  fixture.email = email;
  registerIntegrationFixture({
    connection: User.db,
    collectionName: User.collection.collectionName,
    id: fixture._id,
    ownershipFilter: { email: fixture.email, role: fixture.role }
  });
  return User.create(fixture);
}

export async function createTestSubmissionPolicy({ overrides = {} } = {}) {
  assertModelUsesVerifiedConnection(SubmissionPolicy);
  const policyVersion = `${overrides.policyVersion || "test-only-policy-v1"}-${randomUUID()}`;
  const fixture = {
    _id: overrides._id || new mongoose.Types.ObjectId(),
    policyVersion,
    deadlineLocalTime: "09:30",
    timezone: "Asia/Kolkata",
    workingWeekdays: [1, 2, 3, 4, 5],
    effectiveStartDate: "2026-01-01",
    effectiveEndDate: null,
    active: true,
    ...overrides
  };
  fixture.policyVersion = policyVersion;
  registerIntegrationFixture({
    connection: SubmissionPolicy.db,
    collectionName: SubmissionPolicy.collection.collectionName,
    id: fixture._id,
    ownershipFilter: {
      policyVersion: fixture.policyVersion,
      effectiveStartDate: fixture.effectiveStartDate
    }
  });
  return SubmissionPolicy.create(fixture);
}

export async function createTestExpectedSubmission({
  employeeId,
  reportingDate,
  deadlineAt,
  policyVersion,
  overrides = {}
} = {}) {
  assertModelUsesVerifiedConnection(ExpectedSubmission);
  if (!employeeId || !reportingDate || !deadlineAt || !policyVersion) {
    throw new TypeError("Synthetic expected-day fixtures require employee, date, deadline and policy version.");
  }
  const fixture = {
    _id: overrides._id || new mongoose.Types.ObjectId(),
    employeeId,
    reportingDate,
    expected: true,
    status: "Pending",
    deadlineAt,
    policyVersion,
    submissionId: null,
    ...overrides
  };
  registerIntegrationFixture({
    connection: ExpectedSubmission.db,
    collectionName: ExpectedSubmission.collection.collectionName,
    id: fixture._id,
    ownershipFilter: {
      employeeId: fixture.employeeId,
      reportingDate: fixture.reportingDate,
      expected: fixture.expected,
      policyVersion: fixture.policyVersion
    }
  });
  return ExpectedSubmission.create(fixture);
}

export function registerTestMetricSubmission(submission) {
  assertModelUsesVerifiedConnection(MetricSubmission);
  if (!submission?._id || !submission.employeeId || !submission.reportingDate ||
      !submission.actualSubmittedAt || !submission.policyVersion) {
    throw new TypeError("A persisted metric submission is required for fixture registration.");
  }
  registerPlannedTestMetricSubmission({
    submissionId: submission._id,
    employeeId: submission.employeeId,
    reportingDate: submission.reportingDate,
    actualSubmittedAt: submission.actualSubmittedAt,
    policyVersion: submission.policyVersion
  });
  return submission;
}

export function registerPlannedTestMetricSubmission({
  submissionId,
  employeeId,
  reportingDate,
  actualSubmittedAt,
  policyVersion,
  connection = MetricSubmission.db
} = {}) {
  assertIntegrationFixtureConnection(connection);
  if (connection.name !== APPROVED_DATABASE_NAME) {
    throw new Error("Fixture registration is not bound to the approved integration database.");
  }
  if (!submissionId || !employeeId || !reportingDate || !(actualSubmittedAt instanceof Date) ||
      !Number.isFinite(actualSubmittedAt.getTime()) || typeof policyVersion !== "string" || !policyVersion) {
    throw new TypeError("Planned MetricSubmission fixtures require ID, employee, date, timestamp and policy version.");
  }
  registerIntegrationFixture({
    connection,
    collectionName: "metric_submissions",
    id: submissionId,
    ownershipFilter: {
      employeeId,
      reportingDate,
      actualSubmittedAt,
      policyVersion
    }
  });
  return submissionId;
}
