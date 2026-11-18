
import mongoose from "mongoose";

import EmployeeReportingAssignment from
  "../models/EmployeeReportingAssignment.js";

import { isValidReportingDate } from "../utils/reportingDate.js";

import { SubmissionApiError } from "./dailySubmissionService.js";

import {
  assertProjectManagerOrganizationAccess
} from "./submissionAccessGrantService.js";


function forbidden() {
  return new SubmissionApiError(
    403,
    "FORBIDDEN",
    "You are not authorized to access this submission."
  );
}

function requireReadSession(session) {
  if (
    !session ||
    typeof session !== "object" ||
    Array.isArray(session) ||
    session instanceof Date ||
    session.id == null ||
    session.hasEnded === true
  ) {
    throw unavailable();
  }

  return session;
}

function unavailable() {
  return new SubmissionApiError(
    503,
    "DATABASE_UNAVAILABLE",
    "Read authorization is temporarily unavailable."
  );
}

function integrityError() {
  return new SubmissionApiError(
    500,
    "DATA_INTEGRITY_ERROR",
    "The reporting assignment records are inconsistent."
  );
}

function validateObjectId(value) {
  return typeof value === "string" &&
    /^[a-f\d]{24}$/i.test(value);
}


/**
 * Team Members can access their own records only.
 * Historical access remains available even if their account
 * is subsequently deactivated.
 */
export function assertTeamMemberReadAccess(
  actor,
  employeeId
) {
  if (
    actor?.role !== "team_member" ||
    !validateObjectId(actor.id) ||
    !validateObjectId(String(employeeId)) ||
    actor.id.toLowerCase() !== String(employeeId).toLowerCase()
  ) {
    throw forbidden();
  }

  return true;
}


/**
 * Team Leads can access employees assigned to them
 * on the requested reporting date.
 *
 * Assignment end dates are inclusive.
 * Exactly one matching assignment is required.
 */

export async function assertTeamLeadHistoricalAccess(
  teamLead,
  {
    employeeId,
    reportingDate,
    EmployeeReportingAssignmentModel =
      EmployeeReportingAssignment,
    session
  } = {}
) {
  if (
    teamLead?.role !== "team_lead" ||
    teamLead.active !== true ||
    !validateObjectId(teamLead.id) ||
    !validateObjectId(String(employeeId))
  ) {
    throw forbidden();
  }

  if (!isValidReportingDate(reportingDate)) {
    throw new SubmissionApiError(
      400,
      "INVALID_REPORTING_DATE",
      "A valid reporting date is required."
    );
  }
  requireReadSession(session);

  let assignments;

  try {
    assignments = await EmployeeReportingAssignmentModel.find({
      employeeId: new mongoose.Types.ObjectId(employeeId),
      effectiveStartDate: { $lte: reportingDate },
      $or: [
        { effectiveEndDate: null },
        { effectiveEndDate: { $gte: reportingDate } }
      ]
    })
      .session(session)
      .lean();

  } catch {
    throw unavailable();
  }

  if (!Array.isArray(assignments) || assignments.length > 1) {
    throw integrityError();
  }

  if (assignments.length === 0) {
    throw forbidden();
  }

  const assignment = assignments[0];

  if (
    String(assignment.employeeId) !== String(employeeId)
  ) {
    throw integrityError();
  }

  if (
    String(assignment.teamLeadId) !== String(teamLead.id)
  ) {
    throw forbidden();
  }

  if (
    typeof assignment.teamId !== "string" ||
    !assignment.teamId.trim() ||
    !isValidReportingDate(assignment.effectiveStartDate) ||
    (
      assignment.effectiveEndDate !== null &&
      assignment.effectiveEndDate !== undefined &&
      !isValidReportingDate(assignment.effectiveEndDate)
    ) ||
    assignment.effectiveStartDate > reportingDate ||
    (
      assignment.effectiveEndDate &&
      assignment.effectiveEndDate < reportingDate
    )
  ) {
    throw integrityError();
  }

  return {
    authorized: true,
    assignmentId: String(assignment._id),
    employeeId: String(assignment.employeeId),
    teamLeadId: String(assignment.teamLeadId),
    teamId: assignment.teamId,
    reportingDate
  };
}



/**
 * Resolve the reporting-date intervals a Team Lead is authorized
 * to access for one employee.
 *
 * Assignment start/end dates are inclusive.
 * Every overlapping assignment is validated, including assignments
 * belonging to other Team Leads, to detect inconsistent history.
 */


export async function getTeamLeadAuthorizedDateRanges(
  teamLead,
  {
    employeeId,
    fromDate,
    toDate,
    EmployeeReportingAssignmentModel =
      EmployeeReportingAssignment,
    session
  } = {}
) {
  if (
    teamLead?.role !== "team_lead" ||
    teamLead.active !== true ||
    !validateObjectId(teamLead.id) ||
    !validateObjectId(String(employeeId))
  ) {
    throw forbidden();
  }

  if (
    !isValidReportingDate(fromDate) ||
    !isValidReportingDate(toDate) ||
    fromDate > toDate
  ) {
    throw new SubmissionApiError(
      400,
      "INVALID_REPORTING_DATE",
      "A valid reporting date range is required."
    );
  }
  requireReadSession(session);

  let assignments;

  try {
    assignments = await EmployeeReportingAssignmentModel.find({
      employeeId: new mongoose.Types.ObjectId(employeeId),
      effectiveStartDate: { $lte: toDate },
      $or: [
        { effectiveEndDate: null },
        { effectiveEndDate: { $gte: fromDate } }
      ]
    })
      .session(session)
      .sort({ effectiveStartDate: 1 })
      .lean();

  } catch {
    throw unavailable();
  }

  if (!Array.isArray(assignments)) {
    throw integrityError();
  }

  const normalized = assignments.map(assignment => {
    if (
      !assignment ||
      !validateObjectId(String(assignment._id)) ||
      String(assignment.employeeId) !== String(employeeId) ||
      !validateObjectId(String(assignment.teamLeadId)) ||
      typeof assignment.teamId !== "string" ||
      !assignment.teamId.trim() ||
      !isValidReportingDate(assignment.effectiveStartDate) ||
      (
        assignment.effectiveEndDate !== null &&
        assignment.effectiveEndDate !== undefined &&
        !isValidReportingDate(assignment.effectiveEndDate)
      ) ||
      (
        assignment.effectiveEndDate &&
        assignment.effectiveEndDate < assignment.effectiveStartDate
      ) ||
      assignment.effectiveStartDate > toDate ||
      (
        assignment.effectiveEndDate &&
        assignment.effectiveEndDate < fromDate
      )
    ) {
      throw integrityError();
    }

    return {
      teamLeadId: String(assignment.teamLeadId).toLowerCase(),
      start: assignment.effectiveStartDate,
      end: assignment.effectiveEndDate ?? null
    };
  });

  normalized.sort((a, b) => a.start.localeCompare(b.start));

  // Inclusive intervals must never overlap,
  // regardless of which Team Lead owns them.
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];

    if (previous.end === null || current.start <= previous.end) {
      throw integrityError();
    }
  }

  const requestedLeadId = teamLead.id.toLowerCase();

  return normalized
    .filter(item => item.teamLeadId === requestedLeadId)
    .map(item => ({
      fromDate: item.start > fromDate ? item.start : fromDate,
      toDate: item.end === null || item.end > toDate
        ? toDate
        : item.end
    }))
    .filter(range => range.fromDate <= range.toDate);
}

/**
 * Project Managers require an active account and
 * a persisted active ORGANIZATION access grant.
 */
export async function assertProjectManagerReadAccess(
  projectManager,
  options = {}
) {
  try {
    await assertProjectManagerOrganizationAccess(
      projectManager,
      options
    );

    return true;
  } catch (error) {
    if (error instanceof SubmissionApiError) {
      throw error;
    }

    throw unavailable();
  }
}
