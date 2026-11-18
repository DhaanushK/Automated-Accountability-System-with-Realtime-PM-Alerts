
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateReadReportingDate,
  validateReadEmployeeId,
  validateNoReadQueryParameters,
  validateReadHistoryQuery
} from "../src/services/dailySubmissionReadRequestValidation.js";

function expectApiError(callback, status, code) {
  assert.throws(callback, error => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

// --------------------------------------------------
// REPORTING DATE VALIDATION
// --------------------------------------------------

test("accepts a valid reporting date", () => {
  assert.equal(
    validateReadReportingDate("2026-11-14"),
    "2026-11-14"
  );
});

test("accepts leap-year dates", () => {
  assert.equal(
    validateReadReportingDate("2024-02-29"),
    "2024-02-29"
  );
});

test("rejects invalid reporting date formats", () => {
  for (const value of [
    "14-11-2026",
    "2026/11/14",
    "2026-1-14",
    "2026-11-4",
    "20261114",
    "",
    null,
    undefined,
    20261114
  ]) {
    expectApiError(
      () => validateReadReportingDate(value),
      400,
      "INVALID_REPORTING_DATE"
    );
  }
});

test("rejects impossible calendar dates", () => {
  for (const value of [
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-04-31",
    "1899-12-31"
  ]) {
    expectApiError(
      () => validateReadReportingDate(value),
      400,
      "INVALID_REPORTING_DATE"
    );
  }
});

// --------------------------------------------------
// EMPLOYEE ID VALIDATION
// --------------------------------------------------

test("accepts valid MongoDB ObjectId strings", () => {
  const id = "672000000000000000000001";

  assert.equal(validateReadEmployeeId(id), id);
});

test("rejects malformed employee IDs", () => {
  for (const value of [
    "123",
    "zzzz00000000000000000001",
    "67200000000000000000000",
    "672000000000000000000001extra",
    "",
    null,
    undefined,
    123
  ]) {
    expectApiError(
      () => validateReadEmployeeId(value),
      400,
      "VALIDATION_ERROR"
    );
  }
});

// --------------------------------------------------
// QUERY PARAMETER VALIDATION
// --------------------------------------------------

test("accepts an empty query for endpoints without query parameters", () => {
  assert.deepEqual(validateNoReadQueryParameters({}), {});
});

test("rejects unsupported query parameters", () => {
  for (const query of [
    { employeeId: "672000000000000000000001" },
    { fromDate: "2026-11-01" },
    { page: "1" },
    { unknown: "value" }
  ]) {
    expectApiError(
      () => validateNoReadQueryParameters(query),
      400,
      "VALIDATION_ERROR"
    );
  }
});

test("rejects array and non-string query values", () => {
  for (const query of [
    ["page", "1"],
    { page: ["1", "2"] },
    { page: 1 },
    { page: null },
    { page: { value: "1" } }
  ]) {
    expectApiError(
      () => validateNoReadQueryParameters(query),
      400,
      "VALIDATION_ERROR"
    );
  }
});

// --------------------------------------------------
// HISTORY QUERY VALIDATION
// --------------------------------------------------

test("applies default pagination values", () => {
  assert.deepEqual(
    validateReadHistoryQuery({
      fromDate: "2026-11-01",
      toDate: "2026-11-14"
    }),
    {
      fromDate: "2026-11-01",
      toDate: "2026-11-14",
      page: 1,
      limit: 20
    }
  );
});

test("accepts valid custom pagination values", () => {
  assert.deepEqual(
    validateReadHistoryQuery({
      fromDate: "2026-11-01",
      toDate: "2026-11-14",
      page: "3",
      limit: "50"
    }),
    {
      fromDate: "2026-11-01",
      toDate: "2026-11-14",
      page: 3,
      limit: 50
    }
  );
});

test("rejects missing history date parameters", () => {
  for (const query of [
    {},
    { fromDate: "2026-11-01" },
    { toDate: "2026-11-14" }
  ]) {
    expectApiError(
      () => validateReadHistoryQuery(query),
      400,
      "INVALID_REPORTING_DATE"
    );
  }
});

test("rejects reversed history date ranges", () => {
  expectApiError(
    () => validateReadHistoryQuery({
      fromDate: "2026-11-15",
      toDate: "2026-11-14"
    }),
    400,
    "VALIDATION_ERROR"
  );
});

test("rejects malformed history date values", () => {
  expectApiError(
    () => validateReadHistoryQuery({
      fromDate: "2026-11-01",
      toDate: "2026-02-30"
    }),
    400,
    "INVALID_REPORTING_DATE"
  );
});

test("rejects unsupported history query parameters", () => {
  expectApiError(
    () => validateReadHistoryQuery({
      fromDate: "2026-11-01",
      toDate: "2026-11-14",
      employeeId: "672000000000000000000001"
    }),
    400,
    "VALIDATION_ERROR"
  );
});

// --------------------------------------------------
// PAGINATION EDGE CASES
// --------------------------------------------------

test("rejects invalid page values", () => {
  for (const page of [
    "0",
    "-1",
    "+1",
    "1.5",
    "1e2",
    "abc",
    "",
    "9007199254740992"
  ]) {
    expectApiError(
      () => validateReadHistoryQuery({
        fromDate: "2026-11-01",
        toDate: "2026-11-14",
        page
      }),
      400,
      "VALIDATION_ERROR"
    );
  }
});

test("rejects invalid limit values", () => {
  for (const limit of [
    "0",
    "-1",
    "+1",
    "1.5",
    "1e2",
    "101",
    "abc",
    ""
  ]) {
    expectApiError(
      () => validateReadHistoryQuery({
        fromDate: "2026-11-01",
        toDate: "2026-11-14",
        limit
      }),
      400,
      "VALIDATION_ERROR"
    );
  }
});

test("accepts pagination boundary values", () => {
  assert.deepEqual(
    validateReadHistoryQuery({
      fromDate: "2026-11-01",
      toDate: "2026-11-14",
      page: "1",
      limit: "100"
    }),
    {
      fromDate: "2026-11-01",
      toDate: "2026-11-14",
      page: 1,
      limit: 100
    }
  );
});
