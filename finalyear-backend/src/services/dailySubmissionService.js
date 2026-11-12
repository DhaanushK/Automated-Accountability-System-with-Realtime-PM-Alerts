import mongoose from "mongoose";
import { isValidReportingDate } from "../utils/reportingDate.js";

export const SUBMISSION_TIMEZONE = "Asia/Kolkata";
const COUNT_FIELDS = [
  "ticketsAssigned",
  "ticketsResolved",
  "slaBreaches",
  "reopenedTickets",
  "clientInteractions"
];
const METRIC_FIELDS = new Set([...COUNT_FIELDS, "remarks"]);
const REQUEST_FIELDS = new Set(["reportingDate", "metrics"]);

export class SubmissionApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "SubmissionApiError";
    this.status = status;
    this.code = code;
  }
}

// The transactional write implementation is kept separate so the existing
// request-validation and disabled-route foundation remains unchanged.
export { submitDailySubmission } from "./dailySubmissionWriteService.js";

export function formatSubmissionError(error) {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "An unexpected error occurred.";

  if (error instanceof SubmissionApiError) {
    status = error.status;
    code = error.code;
    message = status >= 500 && status !== 501
      ? "Daily submission services are temporarily unavailable."
      : error.message;
  } else if (error?.code === 11000) {
    status = 409;
    code = "ALREADY_SUBMITTED";
    message = "A submission already exists for this employee and reporting date.";
  } else if (error?.name === "ValidationError" || error?.name === "CastError") {
    status = 400;
    code = "INVALID_REQUEST";
    message = "The request contains invalid data.";
  }

  return {
    status,
    body: { success: false, error: { code, message } }
  };
}
export function getReportingDateAt(instant, timeZone = SUBMISSION_TIMEZONE) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("A valid instant is required to derive the reporting date.");
  }

  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
  } catch {
    throw new TypeError("Invalid IANA timezone.");
  }

  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
  return parts.year + "-" + parts.month + "-" + parts.day;
}


export function validateReportingDateForSubmission(
  reportingDate,
  { clock = () => new Date(), timeZone = SUBMISSION_TIMEZONE } = {}
) {
  if (!isValidReportingDate(reportingDate)) {
    throw new SubmissionApiError(
      400,
      "INVALID_REPORTING_DATE",
      "reportingDate must be a valid YYYY-MM-DD date."
    );
  }

  const currentReportingDate = getReportingDateAt(clock(), timeZone);

  if (reportingDate !== currentReportingDate) {
    throw new SubmissionApiError(
      400,
      "INVALID_REPORTING_DATE",
      "New submissions are only permitted for the current reporting date."
    );
  }

  return currentReportingDate;
}


export function validateSubmissionRequest(
  body,
  { clock = () => new Date(), timeZone = SUBMISSION_TIMEZONE } = {}
) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SubmissionApiError(400, "INVALID_REQUEST", "A JSON object is required.");
  }

  const unexpectedRequestFields = Object.keys(body).filter(key => !REQUEST_FIELDS.has(key));
  if (unexpectedRequestFields.length > 0) {
    throw new SubmissionApiError(400, "INVALID_REQUEST", "The request contains unsupported fields.");
  }

  validateReportingDateForSubmission(body.reportingDate, { clock, timeZone });

  if (!body.metrics || typeof body.metrics !== "object" || Array.isArray(body.metrics)) {
    throw new SubmissionApiError(400, "INVALID_REQUEST", "metrics must be an object.");
  }

  const unexpectedMetricFields = Object.keys(body.metrics).filter(key => !METRIC_FIELDS.has(key));
  if (unexpectedMetricFields.length > 0) {
    throw new SubmissionApiError(400, "INVALID_REQUEST", "metrics contains unsupported fields.");
  }

  for (const field of COUNT_FIELDS) {
    const value = body.metrics[field];
    if (!Number.isInteger(value) || value < 0) {
      throw new SubmissionApiError(400, "INVALID_REQUEST", field + " must be a nonnegative integer.");
    }
  }

  const remarks = body.metrics.remarks === undefined ? "" : body.metrics.remarks;
  if (typeof remarks !== "string" || remarks.length > 1000) {
    throw new SubmissionApiError(400, "INVALID_REQUEST", "remarks must be a string of at most 1000 characters.");
  }

  return {
    reportingDate: body.reportingDate,
    metrics: {
      ticketsAssigned: body.metrics.ticketsAssigned,
      ticketsResolved: body.metrics.ticketsResolved,
      slaBreaches: body.metrics.slaBreaches,
      reopenedTickets: body.metrics.reopenedTickets,
      clientInteractions: body.metrics.clientInteractions,
      remarks
    }
  };
}

export function validateSubmissionId(submissionId) {
  if (!mongoose.isValidObjectId(submissionId)) {
    throw new SubmissionApiError(400, "INVALID_REQUEST", "submissionId must be a valid identifier.");
  }
  return submissionId;
}

export function createSubmissionStoreReadinessGuard({
  isReady = () => mongoose.connection.readyState === 1
} = {}) {
  return (req, res, next) => {
    if (!isReady()) {
      return res.status(503).json({
        success: false,
        error: {
          code: "SUBMISSION_STORE_UNAVAILABLE",
          message: "Daily submission services are temporarily unavailable."
        }
      });
    }
    next();
  };
}