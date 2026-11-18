
import mongoose from "mongoose";
import { isValidReportingDate } from "../utils/reportingDate.js";
import { SubmissionApiError } from "./dailySubmissionService.js";

const HISTORY_QUERY_FIELDS = new Set([
  "fromDate",
  "toDate",
  "page",
  "limit"
]);

const EMPLOYEE_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

function validationError(message) {
  throw new SubmissionApiError(400, "VALIDATION_ERROR", message);
}

function reportingDateError() {
  throw new SubmissionApiError(
    400,
    "INVALID_REPORTING_DATE",
    "A valid reporting date in YYYY-MM-DD format is required."
  );
}

function validateQueryObject(query) {
  if (
    query === null ||
    typeof query !== "object" ||
    Array.isArray(query)
  ) {
    validationError("Query parameters must be an object.");
  }
}

function assertSupportedQueryFields(query, allowedFields) {
  validateQueryObject(query);

  for (const key of Object.keys(query)) {
    if (!allowedFields.has(key)) {
      validationError("The request contains unsupported query parameters.");
    }

    const value = query[key];

    // Express can represent repeated parameters as arrays.
    // Reject arrays and nested objects instead of silently accepting them.
    if (typeof value !== "string") {
      validationError("Query parameters must contain exactly one string value.");
    }
  }
}

export function validateReadReportingDate(value) {
  if (!isValidReportingDate(value)) {
    reportingDateError();
  }

  return value;
}

export function validateReadEmployeeId(value) {
  if (
    typeof value !== "string" ||
    !EMPLOYEE_ID_PATTERN.test(value) ||
    !mongoose.isValidObjectId(value)
  ) {
    validationError("employeeId must be a valid identifier.");
  }

  return value;
}

function parsePositiveInteger(value, field, defaultValue, maximum) {
  if (value === undefined) {
    return defaultValue;
  }

  if (
    typeof value !== "string" ||
    !/^[0-9]+$/.test(value)
  ) {
    validationError(field + " must be a positive integer.");
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    (maximum !== undefined && parsed > maximum)
  ) {
    validationError(
      maximum === undefined
        ? field + " must be a positive integer."
        : field + " must be between 1 and " + maximum + "."
    );
  }

  return parsed;
}

export function validateNoReadQueryParameters(query) {
  assertSupportedQueryFields(query, new Set());
  return {};
}

export function validateReadHistoryQuery(query) {
  assertSupportedQueryFields(query, HISTORY_QUERY_FIELDS);

  const fromDate = validateReadReportingDate(query.fromDate);
  const toDate = validateReadReportingDate(query.toDate);

  if (fromDate > toDate) {
    validationError("fromDate must not be later than toDate.");
  }

  const page = parsePositiveInteger(query.page, "page", 1);
  const limit = parsePositiveInteger(query.limit, "limit", 20, 100);

  return {
    fromDate,
    toDate,
    page,
    limit
  };
}
