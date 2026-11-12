import mongoose from "mongoose";
import User from "../models/User.js";
import MetricSubmission from "../models/MetricSubmission.js";
import ExpectedSubmission from "../models/ExpectedSubmission.js";
import SubmissionPolicy from "../models/SubmissionPolicy.js";
import { isValidLocalTime, isValidReportingDate } from "../utils/reportingDate.js";
import { buildDeadlineInstant, classifySubmission } from "./submissionPolicyService.js";
import { SubmissionApiError, getReportingDateAt } from "./dailySubmissionService.js";

const SUBMISSION_TIMEZONE = "Asia/Kolkata";
const COUNT_FIELDS = Object.freeze([
  "ticketsAssigned",
  "ticketsResolved",
  "slaBreaches",
  "reopenedTickets",
  "clientInteractions"
]);
const METRIC_FIELDS = new Set([...COUNT_FIELDS, "remarks"]);
const REQUEST_FIELDS = new Set(["reportingDate", "metrics"]);

const apiError = (status, code, message) => new SubmissionApiError(status, code, message);
const validationError = message => apiError(400, "VALIDATION_ERROR", message);
const integrityError = () => apiError(500, "DATA_INTEGRITY_ERROR", "Submission records are inconsistent.");
const policyError = () => apiError(500, "POLICY_SNAPSHOT_INVALID", "The saved submission policy is invalid.");
const unavailableError = () => apiError(503, "DATABASE_UNAVAILABLE", "Daily submission services are temporarily unavailable.");
const unconfirmedError = () => apiError(503, "SUBMISSION_OUTCOME_UNCONFIRMED", "The submission outcome could not be confirmed. Retry later.");

function normalizeRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw validationError("A JSON object is required.");
  }
  if (Object.keys(request).some(key => !REQUEST_FIELDS.has(key))) {
    throw validationError("The request contains unsupported fields.");
  }
  if (!isValidReportingDate(request.reportingDate)) {
    throw validationError("reportingDate must be a valid YYYY-MM-DD date.");
  }
  const input = request.metrics;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validationError("metrics must be an object.");
  }
  if (Object.keys(input).some(key => !METRIC_FIELDS.has(key))) {
    throw validationError("metrics contains unsupported fields.");
  }
  const metrics = {};
  for (const field of COUNT_FIELDS) {
    if (!Number.isInteger(input[field]) || input[field] < 0) {
      throw validationError(field + " must be a nonnegative integer.");
    }
    metrics[field] = input[field];
  }
  const remarks = input.remarks === undefined ? "" : input.remarks;
  if (typeof remarks !== "string" || remarks.length > 1000) {
    throw validationError("remarks must be a string of at most 1000 characters.");
  }
  metrics.remarks = remarks;
  return { reportingDate: request.reportingDate, metrics };
}

function getAuthenticatedId(authenticatedUser) {
  const id = authenticatedUser?.id;
  if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) {
    throw apiError(401, "UNAUTHENTICATED", "A valid authenticated user is required.");
  }
  return id;
}

function queryLean(Model, filter, { session, majority = false } = {}) {
  let query = Model.findOne(filter);
  if (session) query = query.session(session);
  if (majority) query = query.read("primary").readConcern("majority");
  return query.lean();
}

async function loadActor(userId, UserModel) {
  const user = await UserModel.findById(userId)
    .select("_id role active employmentStartDate employmentEndDate")
    .lean();
  if (!user) throw apiError(401, "UNAUTHENTICATED", "The authenticated user is unavailable.");
  return user;
}

function datesIncludeEmployment(user, reportingDate) {
  if (!isValidReportingDate(user.employmentStartDate) || user.employmentStartDate > reportingDate) {
    return false;
  }
  if (user.employmentEndDate == null) return true;
  return isValidReportingDate(user.employmentEndDate) && user.employmentEndDate >= reportingDate;
}

async function validatePolicySnapshot(expected, PolicyModel) {
  const date = expected.reportingDate;
  let policy;
  try {
    policy = await PolicyModel.findOne({ policyVersion: expected.policyVersion }).lean();
  } catch {
    throw unavailableError();
  }
  if (!policy || !isValidReportingDate(policy.effectiveStartDate) || policy.effectiveStartDate > date ||
      (policy.effectiveEndDate != null &&
       (!isValidReportingDate(policy.effectiveEndDate) || policy.effectiveEndDate < date)) ||
      !isValidLocalTime(policy.deadlineLocalTime) || typeof policy.timezone !== "string" || !policy.timezone) {
    throw policyError();
  }
  // Preserve the approved fail-closed behavior for overlapping effective
  // versions, without requiring the referenced historical policy to be active.
  let effectivePolicies;
  try {
    effectivePolicies = await PolicyModel.find({
      effectiveStartDate: { $lte: date },
      $or: [{ effectiveEndDate: null }, { effectiveEndDate: { $gte: date } }]
    }).lean();
  } catch {
    throw unavailableError();
  }
  if (!Array.isArray(effectivePolicies) || effectivePolicies.length !== 1 ||
      effectivePolicies[0].policyVersion !== expected.policyVersion) throw policyError();
  let calculatedDeadline;
  try {
    calculatedDeadline = buildDeadlineInstant(date, policy.deadlineLocalTime, policy.timezone);
  } catch {
    throw policyError();
  }
  const storedDeadline = new Date(expected.deadlineAt);
  if (!Number.isFinite(storedDeadline.getTime()) || storedDeadline.getTime() !== calculatedDeadline.getTime()) {
    throw policyError();
  }
  return { policyVersion: policy.policyVersion, deadlineAt: storedDeadline };
}

function sameMetrics(left, right) {
  return COUNT_FIELDS.every(field => left?.[field] === right?.[field]) &&
    (left?.remarks ?? "") === (right?.remarks ?? "");
}

function toSuccessData(submission, isReplay) {
  return {
    submissionId: String(submission._id),
    reportingDate: submission.reportingDate,
    status: submission.status,
    actualSubmittedAt: new Date(submission.actualSubmittedAt).toISOString(),
    applicableDeadlineAt: new Date(submission.applicableDeadlineAt).toISOString(),
    policyVersion: submission.policyVersion,
    metrics: Object.fromEntries([...COUNT_FIELDS, "remarks"].map(field => [field, submission.metrics?.[field] ?? (field === "remarks" ? "" : undefined)])),
    isReplay
  };
}

function assertExpectedConsistency(submission, expected, employeeId, reportingDate) {
  let classifiedStatus;
  try {
    classifiedStatus = classifySubmission(submission.actualSubmittedAt, submission.applicableDeadlineAt);
  } catch {
    throw integrityError();
  }
  if (!submission || String(submission.employeeId) !== String(employeeId) || submission.reportingDate !== reportingDate ||
      !expected || expected.expected !== true || String(expected.employeeId) !== String(employeeId) || expected.reportingDate !== reportingDate ||
      String(expected.submissionId) !== String(submission._id) || expected.status !== submission.status ||
      new Date(expected.statusEvaluatedAt).getTime() !== new Date(submission.actualSubmittedAt).getTime() ||
      classifiedStatus !== submission.status ||
      !["On-Time", "Late"].includes(expected.status) ||
      new Date(expected.deadlineAt).getTime() !== new Date(submission.applicableDeadlineAt).getTime() ||
      expected.policyVersion !== submission.policyVersion) {
    throw integrityError();
  }
}

async function readConsistentExisting(submission, employeeId, reportingDate, ExpectedModel, PolicyModel, options = {}) {
  let expected;
  try {
    expected = await queryLean(ExpectedModel, { employeeId, reportingDate }, options);
  } catch {
    throw unavailableError();
  }
  assertExpectedConsistency(submission, expected, employeeId, reportingDate);
  await validatePolicySnapshot(expected, PolicyModel);
  return expected;
}

function assertNewSubmissionExpectedState(expected) {
  if (["On-Time", "Late"].includes(expected.status)) throw integrityError();
  if (expected.submissionId != null) throw integrityError();
  if (["Missing", "Excluded"].includes(expected.status)) {
    throw apiError(409, "SUBMISSION_NOT_ALLOWED", "This reporting date is not eligible for a new submission.");
  }
  if (expected.expected !== true) {
    throw apiError(409, "SUBMISSION_NOT_ALLOWED", "This reporting date is not eligible for a new submission.");
  }
  if (expected.status !== "Pending") throw integrityError();
}

async function reconcile({ employeeId, reportingDate, metrics, prepared, models, outcomeUnknown = false }) {
  let existing;
  try {
    existing = await queryLean(models.MetricSubmission, { employeeId, reportingDate }, { majority: true });
  } catch {
    throw outcomeUnknown ? unconfirmedError() : unavailableError();
  }
  if (!existing) throw outcomeUnknown ? unconfirmedError() : integrityError();
  try {
    await readConsistentExisting(existing, employeeId, reportingDate, models.ExpectedSubmission, models.SubmissionPolicy, { majority: true });
  } catch (error) {
    if (error instanceof SubmissionApiError) {
      if (outcomeUnknown && error.status === 503) throw unconfirmedError();
      throw error;
    }
    throw outcomeUnknown ? unconfirmedError() : unavailableError();
  }
  if (String(existing._id) === String(prepared._id) &&
      (new Date(existing.actualSubmittedAt).getTime() !== prepared.actualSubmittedAt.getTime() ||
       new Date(existing.applicableDeadlineAt).getTime() !== prepared.applicableDeadlineAt.getTime() ||
       existing.status !== prepared.status || existing.policyVersion !== prepared.policyVersion ||
       !sameMetrics(existing.metrics, prepared.metrics))) {
    throw integrityError();
  }
  if (!sameMetrics(existing.metrics, metrics)) {
    throw apiError(409, "SUBMISSION_CONFLICT", "A different submission already exists for this reporting date.");
  }
  // A different ID can belong to a concurrent, identical request. It is safe
  // to replay that verified record; the logical attempt's ID is never replaced
  // inside its transaction callback or regenerated during reconciliation.
  return { success: true, message: "Daily metrics submitted successfully.", data: toSuccessData(existing, true) };
}

function hasErrorLabel(error, label) {
  return typeof error?.hasErrorLabel === "function"
    ? error.hasErrorLabel(label)
    : Array.isArray(error?.errorLabels) && error.errorLabels.includes(label);
}

function isDuplicateKey(error) {
  return error?.code === 11000;
}

function isUnknownCommit(error) {
  return hasErrorLabel(error, "UnknownTransactionCommitResult");
}

function isMongoError(error) {
  return Boolean(error && (error.name?.startsWith("Mongo") || error.name === "MongoServerError" || error.name === "MongoNetworkError" ||
    error.name === "MongoNetworkTimeoutError" || error.name === "MongoTopologyClosedError" ||
    error.name === "MongoServerSelectionError" || error.code === 11000));
}

/**
 * Persist a daily submission atomically. Identity is derived only from the
 * freshly loaded MongoDB User; request data cannot choose an employee.
 */
export async function submitDailySubmission({
  authenticatedUser,
  request,
  clock = () => new Date(),
  submissionIdFactory = () => new mongoose.Types.ObjectId(),
  models = {},
  mongooseClient = mongoose
} = {}) {
  const Model = {
    User: models.User || User,
    MetricSubmission: models.MetricSubmission || MetricSubmission,
    ExpectedSubmission: models.ExpectedSubmission || ExpectedSubmission,
    SubmissionPolicy: models.SubmissionPolicy || SubmissionPolicy
  };

  let userId;
  let normalized;
  let actor;
  try {
    userId = getAuthenticatedId(authenticatedUser);
    actor = await loadActor(userId, Model.User);
    if (String(actor._id) !== String(userId)) {
      throw apiError(401, "UNAUTHENTICATED", "The authenticated user is unavailable.");
    }
    normalized = normalizeRequest(request);
  } catch (error) {
    if (error instanceof SubmissionApiError) throw error;
    throw unavailableError();
  }

  const employeeId = actor._id;
  let existing;
  try {
    existing = await queryLean(Model.MetricSubmission, {
      employeeId,
      reportingDate: normalized.reportingDate
    });
  } catch {
    throw unavailableError();
  }
  if (existing) {
    await readConsistentExisting(existing, employeeId, normalized.reportingDate, Model.ExpectedSubmission, Model.SubmissionPolicy);
    if (!sameMetrics(existing.metrics, normalized.metrics)) {
      throw apiError(409, "SUBMISSION_CONFLICT", "A different submission already exists for this reporting date.");
    }
    return { success: true, message: "Daily metrics submitted successfully.", data: toSuccessData(existing, true) };
  }

  let capturedAt;
  try {
    capturedAt = new Date(clock());
  } catch {
    throw unavailableError();
  }
  if (!Number.isFinite(capturedAt.getTime())) throw unavailableError();
  const reportingDateAtCapture = getReportingDateAt(capturedAt, SUBMISSION_TIMEZONE);
  if (normalized.reportingDate !== reportingDateAtCapture) {
    throw apiError(400, "INVALID_REPORTING_DATE", "New submissions are allowed only for the current reporting date.");
  }
  if (actor.role !== "team_member") {
    throw apiError(403, "FORBIDDEN", "An active Team Member account is required to submit metrics.");
  }
  if (actor.active !== true) {
    throw apiError(403, "ACCOUNT_INACTIVE", "An active account is required for a new submission.");
  }
  if (!datesIncludeEmployment(actor, normalized.reportingDate)) {
    throw apiError(403, "FORBIDDEN", "The employment period does not include this reporting date.");
  }

  let expected;
  try {
    expected = await queryLean(Model.ExpectedSubmission, {
      employeeId,
      reportingDate: normalized.reportingDate
    });
  } catch {
    throw unavailableError();
  }
  if (!expected) throw apiError(409, "EXPECTED_SUBMISSION_NOT_FOUND", "No expected submission exists for this reporting date.");
  assertNewSubmissionExpectedState(expected);
  const snapshot = await validatePolicySnapshot(expected, Model.SubmissionPolicy);
  const submissionId = submissionIdFactory();
  if (!(submissionId instanceof mongoose.Types.ObjectId)) {
    throw new TypeError("The internal submission ID factory must return a MongoDB ObjectId.");
  }
  const status = classifySubmission(capturedAt, snapshot.deadlineAt);
  const prepared = Object.freeze({
    _id: submissionId,
    employeeId,
    reportingDate: normalized.reportingDate,
    actualSubmittedAt: capturedAt,
    applicableDeadlineAt: snapshot.deadlineAt,
    status,
    metrics: Object.freeze({ ...normalized.metrics }),
    policyVersion: snapshot.policyVersion
  });

  let session;
  try {
    session = await mongooseClient.startSession();
    let created;
    await session.withTransaction(async () => {
      const submission = new Model.MetricSubmission(prepared);
      await submission.save({ session });
      const update = await Model.ExpectedSubmission.updateOne({
        _id: expected._id,
        employeeId,
        reportingDate: normalized.reportingDate,
        expected: true,
        status: "Pending",
        submissionId: null,
        deadlineAt: expected.deadlineAt,
        policyVersion: expected.policyVersion
      }, {
        $set: {
          status: prepared.status,
          submissionId: prepared._id,
          statusEvaluatedAt: prepared.actualSubmittedAt
        }
      }, { session, runValidators: true });
      const matched = update.matchedCount ?? update.n;
      if (matched !== 1) {
        throw apiError(409, "EXPECTED_SUBMISSION_STATE_CHANGED", "The expected submission changed while saving.");
      }
      created = submission;
    });
    return { success: true, message: "Daily metrics submitted successfully.", data: toSuccessData(created, false) };
  } catch (error) {
    if (error instanceof SubmissionApiError) throw error;
    if (isDuplicateKey(error)) {
      return reconcile({ employeeId, reportingDate: normalized.reportingDate, metrics: normalized.metrics, prepared, models: Model });
    }
    if (isUnknownCommit(error)) {
      return reconcile({ employeeId, reportingDate: normalized.reportingDate, metrics: normalized.metrics, prepared, models: Model, outcomeUnknown: true });
    }
    if (isMongoError(error)) throw unavailableError();
    throw error;
  } finally {
    if (session) {
      try { await session.endSession(); } catch { /* preserve the operation outcome */ }
    }
  }
}