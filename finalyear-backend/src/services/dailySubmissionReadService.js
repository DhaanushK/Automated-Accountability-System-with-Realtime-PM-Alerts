
import mongoose from "mongoose";

import MetricSubmission from "../models/MetricSubmission.js";
import ExpectedSubmission from "../models/ExpectedSubmission.js";
import EmployeeReportingAssignment from "../models/EmployeeReportingAssignment.js";
import SubmissionAccessGrant from "../models/SubmissionAccessGrant.js";
import User from "../models/User.js";

import {
  runReadTransaction as defaultReadTransactionRunner
} from "./readTransaction.js";

import {
  SubmissionApiError,
  getReportingDateAt
} from "./dailySubmissionService.js";
import { classifySubmission } from "./submissionPolicyService.js";

import {
  assertTeamMemberReadAccess,
  assertTeamLeadHistoricalAccess,
  assertProjectManagerReadAccess,
  getTeamLeadAuthorizedDateRanges   
} from "./submissionReadAccessService.js";
import { loadReadSubmissionActor } from "./submissionAccessService.js";

import { isValidReportingDate } from "../utils/reportingDate.js";



const SUBMITTED_STATUSES = ["On-Time", "Late"];
const NON_SUBMITTED_STATUSES = ["Pending", "Missing", "Excluded"];

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const DEFAULT_MODELS = {
  MetricSubmission,
  ExpectedSubmission,
  EmployeeReportingAssignment,
  SubmissionAccessGrant,
  UserModel: User
};


// --------------------------------------------------
// ERROR HELPERS
// --------------------------------------------------

function validationError(message) {
  return new SubmissionApiError(
    400,
    "VALIDATION_ERROR",
    message
  );
}

function notFoundError(message = "The requested reporting record was not found.") {
  return new SubmissionApiError(
    404,
    "NOT_FOUND",
    message
  );
}

function integrityError() {
  return new SubmissionApiError(
    500,
    "DATA_INTEGRITY_ERROR",
    "The expected submission and metric records are inconsistent."
  );
}

function unavailableError() {
  return new SubmissionApiError(
    503,
    "DATABASE_UNAVAILABLE",
    "Daily submission records are temporarily unavailable."
  );
}

function assertTeamMemberRole(actor) {
  if (actor?.role !== "team_member") {
    throw new SubmissionApiError(
      403,
      "FORBIDDEN",
      "This self-service operation is restricted to Team Members."
    );
  }
}

function accountInactiveError() {
  return new SubmissionApiError(
    403,
    "ACCOUNT_INACTIVE",
    "Inactive Team Members may access only their own historical records."
  );
}

function assertActiveTeamMember(actor) {
  if (actor?.active !== true) {
    throw accountInactiveError();
  }
}

function assertInactiveMemberHistoricalDate(actor, reportingDate, currentReportingDate) {
  if (actor?.active !== true && reportingDate >= currentReportingDate) {
    throw accountInactiveError();
  }
}

function captureRequestClock(clock) {
  let instant;
  try {
    instant = clock();
  } catch {
    throw unavailableError();
  }

  if (!isFiniteDate(instant)) {
    throw unavailableError();
  }

  const requestNowMs = instant.getTime();
  return Object.freeze({
    requestNowMs,
    currentReportingDate: getReportingDateAt(new Date(requestNowMs))
  });
}

function isFiniteDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isValidObjectId(value) {
  return typeof value === "string" &&
    /^[a-f\d]{24}$/i.test(value);
}

function normalizeObjectId(value, fieldName) {
  const normalized = String(value ?? "");

  if (!isValidObjectId(normalized)) {
    throw validationError(fieldName + " must be a valid identifier.");
  }

  return new mongoose.Types.ObjectId(normalized);
}

function validateDate(value, fieldName = "reportingDate") {
  if (!isValidReportingDate(value)) {
    throw new SubmissionApiError(
      400,
      "INVALID_REPORTING_DATE",
      fieldName + " must be a valid YYYY-MM-DD date."
    );
  }

  return value;
}

function validateDateRange(fromDate, toDate) {
  validateDate(fromDate, "fromDate");
  validateDate(toDate, "toDate");

  if (fromDate > toDate) {
    throw validationError("fromDate cannot be after toDate.");
  }
}

function normalizePagination({ page, limit } = {}) {
  const normalizedPage = page === undefined
    ? DEFAULT_PAGE
    : Number(page);

  const normalizedLimit = limit === undefined
    ? DEFAULT_LIMIT
    : Number(limit);

  if (
    !Number.isInteger(normalizedPage) ||
    normalizedPage < 1 ||
    !Number.isInteger(normalizedLimit) ||
    normalizedLimit < 1 ||
    normalizedLimit > MAX_LIMIT
  ) {
    throw validationError(
      "Pagination values must be positive integers. Limit cannot exceed 100."
    );
  }

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    skip: (normalizedPage - 1) * normalizedLimit
  };
}

function resolveModels(models = {}) {
  return {
    ...DEFAULT_MODELS,
    ...models,

    runReadTransaction:
      models.runReadTransaction ||
      defaultReadTransactionRunner
  };
}

async function executeRead(operation, transactionRunner) {
  try {
    if (typeof transactionRunner !== "function") {
      throw new Error("READ_TRANSACTION_RUNNER_UNAVAILABLE");
    }

    return await transactionRunner(operation);

  } catch (error) {
    if (error instanceof SubmissionApiError) {
      throw error;
    }

    throw unavailableError();
  }
}


// --------------------------------------------------
// ROLE AUTHORIZATION
// --------------------------------------------------

async function authorizeEmployeeDate(
  actor,
  employeeId,
  reportingDate,
  models,
  session
) {
  if (!actor || !actor.id) {
    throw new SubmissionApiError(
      401,
      "UNAUTHENTICATED",
      "A valid authenticated user is required."
    );
  }

  if (actor.role === "team_member") {
    assertTeamMemberReadAccess(actor, employeeId);
    return true;
  }

  if (actor.role === "team_lead") {
    return assertTeamLeadHistoricalAccess(actor, {
      employeeId: String(employeeId),
      reportingDate,
      EmployeeReportingAssignmentModel:
        models.EmployeeReportingAssignment,
      session
    });
  }

  if (actor.role === "project_manager") {
    return assertProjectManagerReadAccess(actor, {
      SubmissionAccessGrantModel:
        models.SubmissionAccessGrant,
      session
    });
  }

  throw new SubmissionApiError(
    403,
    "FORBIDDEN",
    "You are not authorized to access this reporting record."
  );
}

async function authorizeOrganizationRead(
  actor,
  models,
  session
) {
  if (actor?.role !== "project_manager") {
    throw new SubmissionApiError(
      403,
      "FORBIDDEN",
      "Organization-wide reporting access is restricted to Project Managers."
    );
  }

  return assertProjectManagerReadAccess(actor, {
    SubmissionAccessGrantModel:
      models.SubmissionAccessGrant,
    session
  });
}


// --------------------------------------------------
// EXPECTED / METRIC CONSISTENCY
// --------------------------------------------------

function validateExpectedRecord(expected) {
  if (!expected) {
    throw notFoundError();
  }

  const submitted = SUBMITTED_STATUSES.includes(expected.status);
  const notSubmitted = NON_SUBMITTED_STATUSES.includes(expected.status);

  if (
    typeof expected.expected !== "boolean" ||
    (!submitted && !notSubmitted)
  ) {
    throw integrityError();
  }

  if (expected.expected && expected.status === "Excluded") {
    throw integrityError();
  }

  if (!expected.expected && expected.status !== "Excluded") {
    throw integrityError();
  }

  if (submitted && !expected.submissionId) {
    throw integrityError();
  }

  if (notSubmitted && expected.submissionId) {
    throw integrityError();
  }

  if (!expected.expected && !expected.reasonCode) {
    throw integrityError();
  }
}

function formatExpectedRecord(expected) {
  return {
    employeeId: String(expected.employeeId),
    reportingDate: expected.reportingDate,
    expected: expected.expected,
    status: expected.status,
    deadlineAt: expected.deadlineAt,
    policyVersion: expected.policyVersion,
    reasonCode: expected.reasonCode ?? null,
    exceptionId: expected.exceptionId
      ? String(expected.exceptionId)
      : null
  };
}

function formatMetricSubmission(submission) {
  return {
    submissionId: String(submission._id),
    actualSubmittedAt: submission.actualSubmittedAt,
    applicableDeadlineAt: submission.applicableDeadlineAt,
    status: submission.status,
    metrics: {
      ticketsAssigned: submission.metrics.ticketsAssigned,
      ticketsResolved: submission.metrics.ticketsResolved,
      slaBreaches: submission.metrics.slaBreaches,
      reopenedTickets: submission.metrics.reopenedTickets,
      clientInteractions: submission.metrics.clientInteractions,
      remarks: submission.metrics.remarks
    },
    policyVersion: submission.policyVersion
  };
}


// --------------------------------------------------
// ATTACH METRIC SUBMISSION
// --------------------------------------------------

async function attachMetricSubmission(
  expected,
  MetricSubmissionModel,
  session
) {
  validateExpectedRecord(expected);

  const result = formatExpectedRecord(expected);

  // Non-submitted expected days must not have a metric document.
  if (!SUBMITTED_STATUSES.includes(expected.status)) {
    const orphanSubmission = await MetricSubmissionModel.findOne({
      employeeId: expected.employeeId,
      reportingDate: expected.reportingDate
    })
      .session(session)
      .select("_id")
      .lean();

    if (orphanSubmission) {
      throw integrityError();
    }

    return {
      ...result,
      submission: null
    };
  }

  // Persisted submitted records must contain real BSON dates. Do not infer
  // missing timestamp evidence or coerce malformed values into dates.
  if (
    !isFiniteDate(expected.deadlineAt) ||
    !isFiniteDate(expected.statusEvaluatedAt)
  ) {
    throw integrityError();
  }

  const submission = await MetricSubmissionModel.findOne({
    _id: expected.submissionId,
    employeeId: expected.employeeId,
    reportingDate: expected.reportingDate
  })
    .session(session)
    .lean();

  if (
    !submission ||
    String(submission.employeeId) !== String(expected.employeeId) ||
    submission.reportingDate !== expected.reportingDate ||
    !submission.metrics ||
    submission.policyVersion !== expected.policyVersion
  ) {
    throw integrityError();
  }

  if (
    !isFiniteDate(submission.actualSubmittedAt) ||
    !isFiniteDate(submission.applicableDeadlineAt) ||
    expected.statusEvaluatedAt.getTime() !== submission.actualSubmittedAt.getTime()
  ) {
    throw integrityError();
  }

  let punctualityStatus;
  try {
    punctualityStatus = classifySubmission(
      submission.actualSubmittedAt,
      submission.applicableDeadlineAt
    );
  } catch {
    throw integrityError();
  }
  if (expected.status !== punctualityStatus || submission.status !== punctualityStatus) {
    throw integrityError();
  }

  // Both records must preserve the exact same applicable deadline.
  const expectedDeadline = expected.deadlineAt.getTime();
  const submissionDeadline = submission.applicableDeadlineAt.getTime();

  if (
    !Number.isFinite(submissionDeadline) ||
    submissionDeadline !== expectedDeadline
  ) {
    throw integrityError();
  }

  return {
    ...result,
    submission: formatMetricSubmission(submission)
  };
}


// --------------------------------------------------
// AUTHORIZED DAY LOOKUP
// --------------------------------------------------

async function getAuthorizedDay({
  actor,
  employeeId,
  reportingDate,
  models,
  session
}) {
  validateDate(reportingDate);

  const normalizedEmployeeId = normalizeObjectId(
    String(employeeId),
    "employeeId"
  );

  // Authorization occurs before retrieving the expected-day record.
  await authorizeEmployeeDate(
    actor,
    normalizedEmployeeId,
    reportingDate,
    models,
    session
  );

  const expected = await models.ExpectedSubmission.findOne({
    employeeId: normalizedEmployeeId,
    reportingDate
  })
    .session(session)
    .lean();

  if (!expected) {
    throw notFoundError();
  }

  return attachMetricSubmission(
    expected,
    models.MetricSubmission,
    session
  );
}


// --------------------------------------------------
// TEAM MEMBER: OWN REPORTING DAY
// --------------------------------------------------

export async function getOwnDay({
  authenticatedUserId,
  reportingDate,
  clock = () => new Date(),
  models = {}
} = {}) {
  validateDate(reportingDate);
  const requestClock = captureRequestClock(clock);
  const resolved = resolveModels(models);

  return executeRead(async session => {
    const actor = await loadReadSubmissionActor(authenticatedUserId, {
      session,
      UserModel: resolved.UserModel
    });
    assertTeamMemberRole(actor);
    assertTeamMemberReadAccess(actor, authenticatedUserId);
    assertInactiveMemberHistoricalDate(
      actor,
      reportingDate,
      requestClock.currentReportingDate
    );

    return getAuthorizedDay({
      actor,
      employeeId: actor?.id,
      reportingDate,
      models: resolved,
      session
    });
  }, resolved.runReadTransaction);
}


// --------------------------------------------------
// TEAM MEMBER: CURRENT REPORTING DAY
// --------------------------------------------------


export async function getOwnCurrent({
  authenticatedUserId,
  clock = () => new Date(),
  models = {}
} = {}) {
  const requestClock = captureRequestClock(clock);
  const resolved = resolveModels(models);

  return executeRead(async session => {
    const actor = await loadReadSubmissionActor(authenticatedUserId, {
      session,
      UserModel: resolved.UserModel
    });
    assertTeamMemberRole(actor);
    assertTeamMemberReadAccess(actor, authenticatedUserId);
    assertActiveTeamMember(actor);
    const reportingDate = requestClock.currentReportingDate;

    return getAuthorizedDay({
      actor,
      employeeId: actor?.id,
      reportingDate,
      models: resolved,
      session
    });
  }, resolved.runReadTransaction);
}

// --------------------------------------------------
// TEAM MEMBER: OWN HISTORY
// --------------------------------------------------

export async function getOwnHistory({
  authenticatedUserId,
  fromDate,
  toDate,
  page,
  limit,
  clock = () => new Date(),
  models = {}
} = {}) {
  validateDateRange(fromDate, toDate);
  const pagination = normalizePagination({ page, limit });
  const requestClock = captureRequestClock(clock);
  const resolved = resolveModels(models);

  return executeRead(async session => {
    const actor = await loadReadSubmissionActor(authenticatedUserId, {
      session,
      UserModel: resolved.UserModel
    });
    assertTeamMemberRole(actor);
    assertTeamMemberReadAccess(actor, authenticatedUserId);
    assertInactiveMemberHistoricalDate(
      actor,
      toDate,
      requestClock.currentReportingDate
    );
    const employeeId = normalizeObjectId(actor.id, "employeeId");

    assertTeamMemberReadAccess(actor, String(employeeId));

    const filter = {
      employeeId,
      reportingDate: {
        $gte: fromDate,
        $lte: toDate
      }
    };

    // Sequential reads: parallel operations are not supported
    // within a MongoDB transaction.
    const records = await resolved.ExpectedSubmission.find(filter)
      .session(session)
      .sort({ reportingDate: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean();

    const total = await resolved.ExpectedSubmission.countDocuments(filter)
      .session(session);

    const data = [];

    for (const record of records) {
      data.push(
        await attachMetricSubmission(
          record,
          resolved.MetricSubmission,
          session
        )
      );
    }

    return {
      records: data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      }
    };
  }, resolved.runReadTransaction);
}


// --------------------------------------------------
// TEAM LEAD / PROJECT MANAGER: EMPLOYEE DAY
// --------------------------------------------------

export async function getEmployeeDay({
  actor,
  employeeId,
  reportingDate,
  models = {}
} = {}) {
  const resolved = resolveModels(models);

  return executeRead(async session => {
    return getAuthorizedDay({
      actor,
      employeeId,
      reportingDate,
      models: resolved,
      session
    });
  }, resolved.runReadTransaction);
}


// --------------------------------------------------
// TEAM LEAD / PROJECT MANAGER: EMPLOYEE HISTORY
// --------------------------------------------------


export async function getEmployeeHistory({
  actor,
  employeeId,
  fromDate,
  toDate,
  page,
  limit,
  models = {}
} = {}) {
  const resolved = resolveModels(models);

  return executeRead(async session => {
    validateDateRange(fromDate, toDate);

    const normalizedEmployeeId = normalizeObjectId(
      employeeId,
      "employeeId"
    );

    if (
      actor?.role !== "team_lead" &&
      actor?.role !== "project_manager"
    ) {
      throw new SubmissionApiError(
        403,
        "FORBIDDEN",
        "Employee history access is not authorized."
      );
    }

    const pagination = normalizePagination({ page, limit });

    let authorizedRanges = null;

    if (actor.role === "project_manager") {
      await authorizeOrganizationRead(
        actor,
        resolved,
        session
      );
    } else {
      authorizedRanges = await getTeamLeadAuthorizedDateRanges(
        actor,
        {
          employeeId: String(normalizedEmployeeId),
          fromDate,
          toDate,
          EmployeeReportingAssignmentModel:
            resolved.EmployeeReportingAssignment,
          session
        }
      );

      // No authorized interval means no visible reporting records.
      if (authorizedRanges.length === 0) {
        return {
          employeeId: String(normalizedEmployeeId),
          records: [],
          pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: 0,
            totalPages: 0
          }
        };
      }
    }

    const filter = {
      employeeId: normalizedEmployeeId,
      reportingDate: {
        $gte: fromDate,
        $lte: toDate
      }
    };

    // Restrict the database query itself to authorized intervals.
    if (authorizedRanges !== null) {
      filter.$or = authorizedRanges.map(range => ({
        reportingDate: {
          $gte: range.fromDate,
          $lte: range.toDate
        }
      }));
    }

    // Sequential reads inside the same transaction.
    const records = await resolved.ExpectedSubmission.find(filter)
      .session(session)
      .sort({ reportingDate: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean();

    const total = await resolved.ExpectedSubmission.countDocuments(filter)
      .session(session);

    const data = [];

    for (const expected of records) {
      // Recheck Team Lead authorization for each returned record.
      // The authorization query shares the same snapshot.
      if (actor.role === "team_lead") {
        await authorizeEmployeeDate(
          actor,
          normalizedEmployeeId,
          expected.reportingDate,
          resolved,
          session
        );
      }

      data.push(
        await attachMetricSubmission(
          expected,
          resolved.MetricSubmission,
          session
        )
      );
    }

    return {
      employeeId: String(normalizedEmployeeId),
      records: data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      }
    };
  }, resolved.runReadTransaction);
}


// --------------------------------------------------
// PROJECT MANAGER: ORGANIZATION REPORTING DAY
// --------------------------------------------------

export async function getOrganizationDay({
  actor,
  reportingDate,
  page,
  limit,
  models = {}
} = {}) {
  const resolved = resolveModels(models);

  return executeRead(async session => {
    validateDate(reportingDate);

    await authorizeOrganizationRead(
      actor,
      resolved,
      session
    );

    const pagination = normalizePagination({ page, limit });

    const filter = {
      reportingDate
    };

    // Sequential reads inside the transaction.
    const records = await resolved.ExpectedSubmission.find(filter)
      .session(session)
      .sort({ employeeId: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean();

    const total = await resolved.ExpectedSubmission.countDocuments(filter)
      .session(session);

    const data = [];

    for (const record of records) {
      data.push(
        await attachMetricSubmission(
          record,
          resolved.MetricSubmission,
          session
        )
      );
    }

    return {
      reportingDate,
      records: data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      }
    };
  }, resolved.runReadTransaction);
}


// --------------------------------------------------
// PROJECT MANAGER: ORGANIZATION HISTORY
// --------------------------------------------------

export async function getOrganizationHistory({
  actor,
  fromDate,
  toDate,
  page,
  limit,
  models = {}
} = {}) {
  const resolved = resolveModels(models);

  return executeRead(async session => {
    validateDateRange(fromDate, toDate);

    await authorizeOrganizationRead(
      actor,
      resolved,
      session
    );

    const pagination = normalizePagination({ page, limit });

    const filter = {
      reportingDate: {
        $gte: fromDate,
        $lte: toDate
      }
    };

    // Sequential reads inside the transaction.
    const records = await resolved.ExpectedSubmission.find(filter)
      .session(session)
      .sort({ reportingDate: -1, employeeId: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean();

    const total = await resolved.ExpectedSubmission.countDocuments(filter)
      .session(session);

    const data = [];

    for (const record of records) {
      data.push(
        await attachMetricSubmission(
          record,
          resolved.MetricSubmission,
          session
        )
      );
    }

    return {
      records: data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      }
    };
  }, resolved.runReadTransaction);
}


// --------------------------------------------------
// SUBMISSION DETAIL: ALL THREE ROLES
// --------------------------------------------------

export async function getSubmissionDetail({
  actor,
  submissionId,
  models = {}
} = {}) {
  const resolved = resolveModels(models);

  return executeRead(async session => {
    const normalizedSubmissionId = normalizeObjectId(
      submissionId,
      "submissionId"
    );

    // Fetch only the metadata needed to authorize access.
    const metadata = await resolved.MetricSubmission.findById(
      normalizedSubmissionId
    )
      .session(session)
      .select("_id employeeId reportingDate")
      .lean();

    if (!metadata) {
      throw notFoundError(
        "The requested submission was not found."
      );
    }

    // Authorization happens before metric details are retrieved.
    await authorizeEmployeeDate(
      actor,
      metadata.employeeId,
      metadata.reportingDate,
      resolved,
      session
    );

    const expected = await resolved.ExpectedSubmission.findOne({
      employeeId: metadata.employeeId,
      reportingDate: metadata.reportingDate,
      submissionId: normalizedSubmissionId
    })
      .session(session)
      .lean();

    if (
      !expected ||
      !SUBMITTED_STATUSES.includes(expected.status)
    ) {
      throw integrityError();
    }

    const result = await attachMetricSubmission(
      expected,
      resolved.MetricSubmission,
      session
    );

    return result;
  }, resolved.runReadTransaction);
}
