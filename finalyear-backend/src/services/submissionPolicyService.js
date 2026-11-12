import SubmissionPolicy from "../models/SubmissionPolicy.js";
import { isValidLocalTime, isValidReportingDate } from "../utils/reportingDate.js";

function toValidDate(value, name) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(name + " must be a valid Date or date-time value");
  }
  return date;
}

function getWallClockParts(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function matchesWallClock(parts, target) {
  return Object.keys(target).every(key => parts[key] === target[key]);
}

/**
 * Convert local wall time to one UTC instant. Ambiguous fall-back times and
 * nonexistent spring-forward times are rejected instead of silently selecting.
 */
export function buildDeadlineInstant(reportingDate, localTime, timeZone = "Asia/Kolkata") {
  if (!isValidReportingDate(reportingDate)) {
    throw new TypeError("reportingDate must be a valid YYYY-MM-DD date");
  }
  if (!isValidLocalTime(localTime)) {
    throw new TypeError("localTime must use 24-hour HH:mm format");
  }

  const [year, month, day] = reportingDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const target = { year, month, day, hour, minute, second: 0 };
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(targetAsUtc));
  } catch {
    throw new TypeError("Invalid IANA timezone: " + timeZone);
  }

  // Sample offsets on both sides of the target date. Candidate instants are
  // then round-tripped through Intl to detect zero (gap) or multiple (fold) matches.
  const offsets = new Set();
  for (const hoursFromTarget of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = new Date(targetAsUtc + hoursFromTarget * 60 * 60 * 1000);
    const wall = getWallClockParts(sample, timeZone);
    const wallAsUtc = Date.UTC(
      wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second
    );
    offsets.add(wallAsUtc - sample.getTime());
  }

  const candidates = [];
  for (const offset of offsets) {
    const candidate = new Date(targetAsUtc - offset);
    if (matchesWallClock(getWallClockParts(candidate, timeZone), target)) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    throw new RangeError("Local deadline does not exist in timezone " + timeZone);
  }
  if (candidates.length > 1) {
    throw new RangeError("Local deadline is ambiguous in timezone " + timeZone);
  }

  return candidates[0];
}

export async function resolveEffectiveSubmissionPolicy(
  reportingDate,
  { policyModel = SubmissionPolicy } = {}
) {
  if (!isValidReportingDate(reportingDate)) {
    throw new TypeError("reportingDate must be a valid YYYY-MM-DD date");
  }

  const matches = await policyModel.find({
    active: true,
    effectiveStartDate: { $lte: reportingDate },
    $or: [
      { effectiveEndDate: null },
      { effectiveEndDate: { $gte: reportingDate } }
    ]
  }).lean();

  if (!matches.length) {
    throw new Error("No active submission policy applies to " + reportingDate);
  }
  if (matches.length > 1) {
    throw new Error("Multiple active submission policies apply to " + reportingDate);
  }

  return matches[0];
}

export function classifySubmission(actualSubmittedAt, applicableDeadlineAt) {
  const submitted = toValidDate(actualSubmittedAt, "actualSubmittedAt");
  const deadline = toValidDate(applicableDeadlineAt, "applicableDeadlineAt");
  return submitted.getTime() <= deadline.getTime() ? "On-Time" : "Late";
}

export async function evaluateSubmissionDeadline(
  reportingDate,
  { policyModel = SubmissionPolicy, clock = () => new Date() } = {}
) {
  const policy = await resolveEffectiveSubmissionPolicy(reportingDate, { policyModel });
  const actualSubmittedAt = toValidDate(clock(), "server clock");
  const applicableDeadlineAt = buildDeadlineInstant(
    reportingDate,
    policy.deadlineLocalTime,
    policy.timezone
  );

  return {
    policy,
    actualSubmittedAt,
    applicableDeadlineAt,
    status: classifySubmission(actualSubmittedAt, applicableDeadlineAt)
  };
}

export function isApprovedExceptionForDate(exception, reportingDate, employeeId) {
  if (
    !exception ||
    exception.approvalStatus !== "Approved" ||
    !isValidReportingDate(reportingDate) ||
    !isValidReportingDate(exception.startDate) ||
    !isValidReportingDate(exception.endDate) ||
    exception.startDate > reportingDate ||
    reportingDate > exception.endDate
  ) {
    return false;
  }

  const exceptionEmployeeId = exception.employeeId?._id ?? exception.employeeId ?? null;
  const targetEmployeeId = employeeId?._id ?? employeeId ?? null;

  if (!targetEmployeeId) {
    return false;
  }
  if (exception.exceptionType === "Holiday" && exceptionEmployeeId === null) {
    return true;
  }
  if (!exceptionEmployeeId || !targetEmployeeId) {
    return false;
  }

  return String(exceptionEmployeeId) === String(targetEmployeeId);
}