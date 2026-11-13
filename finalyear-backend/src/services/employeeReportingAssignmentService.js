import mongoose from "mongoose";

import {
  AssignmentApiError,
  INITIAL_ROSTER_DATE,
  INITIAL_ROSTER_SOURCE,
  createInitialEmployeeReportingAssignment
} from "./employeeReportingAssignmentWriteService.js";

export {
  AssignmentApiError,
  INITIAL_ROSTER_DATE,
  INITIAL_ROSTER_SOURCE
};

const REQUEST_FIELDS = new Set(["employeeId", "teamLeadId"]);

export function validateInitialAssignmentRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new AssignmentApiError(
      400,
      "VALIDATION_ERROR",
      "An assignment object is required."
    );
  }

  if (Object.keys(request).some(key => !REQUEST_FIELDS.has(key))) {
    throw new AssignmentApiError(
      400,
      "VALIDATION_ERROR",
      "The assignment contains unsupported fields."
    );
  }

  for (const field of REQUEST_FIELDS) {
    if (!mongoose.isValidObjectId(request[field])) {
      throw new AssignmentApiError(
        400,
        "VALIDATION_ERROR",
        field + " must be a valid identifier."
      );
    }
  }

  return {
    employeeId: new mongoose.Types.ObjectId(request.employeeId),
    teamLeadId: new mongoose.Types.ObjectId(request.teamLeadId)
  };
}

export function formatAssignmentError(error) {
  if (error instanceof AssignmentApiError) {
    return {
      status: error.status,
      body: {
        success: false,
        error: {
          code: error.code,
          message: error.status >= 500
            ? "Employee reporting assignment services are temporarily unavailable."
            : error.message
        }
      }
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred."
      }
    }
  };
}

export async function createInitialAssignment({
  request,
  models = {},
  mongooseClient = mongoose
} = {}) {
  const normalized = validateInitialAssignmentRequest(request);

  return createInitialEmployeeReportingAssignment({
    ...normalized,
    models,
    mongooseClient
  });
}
