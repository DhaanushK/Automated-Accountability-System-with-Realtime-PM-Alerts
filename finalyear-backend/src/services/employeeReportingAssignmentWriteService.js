import mongoose from "mongoose";
import User from "../models/User.js";
import EmployeeReportingAssignment from
  "../models/EmployeeReportingAssignment.js";
export const INITIAL_ROSTER_DATE = "2026-10-11";
export const INITIAL_ROSTER_SOURCE =
  "SYNTHETIC_ROSTER_2026-10-11";

export class AssignmentApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AssignmentApiError";
    this.status = status;
    this.code = code;
  }
}
const assignmentError = (status, code, message) =>
  new AssignmentApiError(status, code, message);

const unavailableError = () =>
  assignmentError(
    503,
    "DATABASE_UNAVAILABLE",
    "Assignment services are temporarily unavailable."
  );

const unconfirmedError = () =>
  assignmentError(
    503,
    "ASSIGNMENT_OUTCOME_UNCONFIRMED",
    "The assignment outcome could not be confirmed. Retry later."
  );

const conflictError = () =>
  assignmentError(
    409,
    "ASSIGNMENT_CONFLICT",
    "An assignment already exists or conflicts with the requested assignment."
  );

const integrityError = () =>
  assignmentError(
    500,
    "DATA_INTEGRITY_ERROR",
    "The assignment records are inconsistent."
  );

function hasErrorLabel(error, label) {
  return typeof error?.hasErrorLabel === "function"
    ? error.hasErrorLabel(label)
    : Array.isArray(error?.errorLabels) &&
      error.errorLabels.includes(label);
}

function isMongoError(error) {
  return Boolean(
    error &&
    (
      error.name?.startsWith("Mongo") ||
      error.name === "MongoServerError" ||
      error.name === "MongoNetworkError" ||
      error.name === "MongoNetworkTimeoutError" ||
      error.name === "MongoTopologyClosedError" ||
      error.name === "MongoServerSelectionError" ||
      error.code === 11000
    )
  );
}

function matchedCount(result) {
  return result.matchedCount ?? result.n ?? 0;
}

function assignmentMatches(record, expected) {
  const validTeamId =
    typeof record?.teamId === "string" &&
    record.teamId.trim().length > 0;

  const teamMatches = expected.teamId === undefined
    ? validTeamId
    : record.teamId === expected.teamId;

  return Boolean(
    record &&
    String(record.employeeId) === String(expected.employeeId) &&
    String(record.teamLeadId) === String(expected.teamLeadId) &&
    teamMatches &&
    record.effectiveStartDate === INITIAL_ROSTER_DATE &&
    record.effectiveEndDate == null &&
    record.assignmentType === "INITIAL" &&
    record.sourceType === "SIMULATED_ROSTER" &&
    record.sourceReference === INITIAL_ROSTER_SOURCE
  );
}

function toResult(record, isReplay) {
  return {
    success: true,
    message: isReplay
      ? "The initial reporting assignment already exists."
      : "Initial reporting assignment created successfully.",
    data: {
      assignmentId: String(record._id),
      employeeId: String(record.employeeId),
      teamLeadId: String(record.teamLeadId),
      teamId: record.teamId,
      effectiveStartDate: record.effectiveStartDate,
      effectiveEndDate: record.effectiveEndDate,
      assignmentType: record.assignmentType,
      sourceType: record.sourceType,
      sourceReference: record.sourceReference,
      isReplay
    }
  };
}

function majorityAssignmentQuery(Model, employeeId) {
  return Model.findOne({
    employeeId,
    effectiveStartDate: INITIAL_ROSTER_DATE
  })
    .read("primary")
    .readConcern("majority")
    .lean();
}

async function reconcile({
  Model,
  employeeId,
  expected,
  outcomeUnknown
}) {
  let existing;

  try {
    existing = await majorityAssignmentQuery(Model, employeeId);
  } catch {
    throw outcomeUnknown ? unconfirmedError() : unavailableError();
  }

  if (!existing) {
    if (outcomeUnknown) throw unconfirmedError();
    throw integrityError();
  }

  if (!assignmentMatches(existing, expected)) {
  if (outcomeUnknown) {
    throw unconfirmedError();
  }

  throw conflictError();
}

  return toResult(existing, true);
}

async function loadUser(Model, id, session) {
  return Model.findById(id)
    .select("_id role teamId")
    .session(session)
    .lean();
}

export async function createInitialEmployeeReportingAssignment({
  employeeId,
  teamLeadId,
  models = {},
  mongooseClient = mongoose
} = {}) {
  const Model = {
    User: models.User || User,
    EmployeeReportingAssignment:
      models.EmployeeReportingAssignment ||
      EmployeeReportingAssignment
  };

  if (
    !(employeeId instanceof mongoose.Types.ObjectId) ||
    !(teamLeadId instanceof mongoose.Types.ObjectId)
  ) {
    throw assignmentError(
      400,
      "VALIDATION_ERROR",
      "Valid employee and Team Lead identifiers are required."
    );
  }

  const expectedBase = {
    employeeId,
    teamLeadId,
    effectiveStartDate: INITIAL_ROSTER_DATE,
    effectiveEndDate: null,
    assignmentType: "INITIAL",
    sourceType: "SIMULATED_ROSTER",
    sourceReference: INITIAL_ROSTER_SOURCE
  };

  // Idempotent preflight: an exact existing assignment can be replayed.
  let existing;

  try {
    existing = await Model.EmployeeReportingAssignment.findOne({
      employeeId,
      effectiveStartDate: INITIAL_ROSTER_DATE
    }).lean();
  } catch {
    throw unavailableError();
  }

  if (existing) {
    if (assignmentMatches(existing, {
      ...expectedBase,
      teamId: existing.teamId
    })) {
      return toResult(existing, true);
    }

    throw conflictError();
  }

  let session;

  try {
    session = await mongooseClient.startSession();

    let committedResult;

    await session.withTransaction(async () => {
      // Reload both accounts within the transaction.
      const employee = await loadUser(
  Model.User,
  employeeId,
  session
);

const teamLead = await loadUser(
  Model.User,
  teamLeadId,
  session
);

      if (!employee || !teamLead) {
        throw assignmentError(
          404,
          "ACCOUNT_NOT_FOUND",
          "The employee or Team Lead account does not exist."
        );
      }

      if (employee.role !== "team_member") {
        throw assignmentError(
          409,
          "INVALID_EMPLOYEE_ROLE",
          "The assigned employee must have the team_member role."
        );
      }

      if (teamLead.role !== "team_lead") {
        throw assignmentError(
          409,
          "INVALID_TEAM_LEAD_ROLE",
          "The reporting manager must have the team_lead role."
        );
      }

      if (
        typeof employee.teamId !== "string" ||
        !employee.teamId ||
        employee.teamId !== teamLead.teamId
      ) {
        throw assignmentError(
          409,
          "TEAM_MISMATCH",
          "The employee and Team Lead must belong to the same team."
        );
      }

      const teamId = employee.teamId;

      // Serialize assignment changes for this employee.
      const revisionUpdate = await Model.User.updateOne(
        {
          _id: employeeId,
          role: "team_member"
        },
        {
          $inc: { assignmentRevision: 1 }
        },
        { session }
      );

      if (matchedCount(revisionUpdate) !== 1) {
        throw assignmentError(
          409,
          "EMPLOYEE_STATE_CHANGED",
          "The employee account changed during assignment."
        );
      }

      // Inclusive overlap detection.
      // This new initial assignment has no end date.
      const overlapping = await
  Model.EmployeeReportingAssignment.findOne({
    employeeId,
    $or: [
      { effectiveEndDate: null },
      { effectiveEndDate: { $gte: INITIAL_ROSTER_DATE } }
    ]
  })
    .session(session)
    .lean();

      if (overlapping) {
        throw conflictError();
      }

      const assignment = new Model.EmployeeReportingAssignment({
        ...expectedBase,
        teamId
      });

      await assignment.save({ session });

      committedResult = toResult(assignment, false);
    }, {
      readPreference: "primary",
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" }
    });

    return committedResult;
  } catch (error) {
    if (error instanceof AssignmentApiError) {
      throw error;
    }

    if (error?.code === 11000) {
      return reconcile({
        Model: Model.EmployeeReportingAssignment,
        employeeId,
        expected: expectedBase,
        outcomeUnknown: false
      });
    }

    if (hasErrorLabel(error, "UnknownTransactionCommitResult")) {
      return reconcile({
        Model: Model.EmployeeReportingAssignment,
        employeeId,
        expected: expectedBase,
        outcomeUnknown: true
      });
    }   

    if (isMongoError(error)) {
      throw unavailableError();
    }

    throw error;
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {
        // Preserve the original operation outcome.
      }
    }
  }
}

async function resolveEmployee(UserModel, employeeId) {
  try {
    return await UserModel.findById(employeeId)
      .select("_id teamId")
      .read("primary")
      .readConcern("majority")
      .lean();
  } catch {
    return null;
  }
}

async function resolveTeamId(UserModel, employeeId) {
  const employee = await resolveEmployee(UserModel, employeeId);

  if (!employee?.teamId) {
    throw integrityError();
  }

  return employee.teamId;
}
