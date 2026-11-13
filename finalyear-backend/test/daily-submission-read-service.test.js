
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  getOwnDay,
  getOwnCurrent,
  getOwnHistory,
  getEmployeeDay,
  getEmployeeHistory,
  getOrganizationDay,
  getOrganizationHistory,
  getSubmissionDetail
} from "../src/services/dailySubmissionReadService.js";

const EMPLOYEE_ID = "672000000000000000000001";
const TEAM_LEAD_ID = "672000000000000000000002";
const OTHER_LEAD_ID = "672000000000000000000003";
const PM_ID = "672000000000000000000004";
const SUBMISSION_ID = "672000000000000000000005";

const REPORTING_DATE = "2026-11-13";
const IST_TODAY = "2026-11-14";
const DEADLINE = new Date("2026-11-13T04:00:00.000Z");
const SUBMITTED_AT = new Date("2026-11-13T03:30:00.000Z");

const memberActor = {
  id: EMPLOYEE_ID,
  role: "team_member",
  active: true
};

const inactiveMemberActor = {
  ...memberActor,
  active: false
};

const teamLeadActor = {
  id: TEAM_LEAD_ID,
  role: "team_lead",
  active: true
};

const projectManagerActor = {
  id: PM_ID,
  role: "project_manager",
  active: true
};


// --------------------------------------------------
// FIXTURE FACTORIES
// --------------------------------------------------

function createExpected(overrides = {}) {
  const status = overrides.status ?? "On-Time";
  return {
    _id: new mongoose.Types.ObjectId(),
    employeeId: new mongoose.Types.ObjectId(EMPLOYEE_ID),
    reportingDate: REPORTING_DATE,
    expected: true,
    status,
    deadlineAt: DEADLINE,
    policyVersion: "POLICY-V1",
    statusEvaluatedAt: ["On-Time", "Late"].includes(status)
      ? SUBMITTED_AT
      : null,
    reasonCode: "WORKDAY",
    exceptionId: null,
    submissionId: new mongoose.Types.ObjectId(SUBMISSION_ID),
    ...overrides
  };
}

function createMetricSubmission(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(SUBMISSION_ID),
    employeeId: new mongoose.Types.ObjectId(EMPLOYEE_ID),
    reportingDate: REPORTING_DATE,
    actualSubmittedAt: SUBMITTED_AT,
    applicableDeadlineAt: DEADLINE,
    status: "On-Time",
    policyVersion: "POLICY-V1",
    metrics: {
      ticketsAssigned: 20,
      ticketsResolved: 15,
      slaBreaches: 1,
      reopenedTickets: 2,
      clientInteractions: 10,
      remarks: "Daily update"
    },
    ...overrides
  };
}

function createAssignment(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    employeeId: new mongoose.Types.ObjectId(EMPLOYEE_ID),
    teamLeadId: new mongoose.Types.ObjectId(TEAM_LEAD_ID),
    teamId: "TEAM-ALPHA",
    effectiveStartDate: "2026-10-11",
    effectiveEndDate: null,
    ...overrides
  };
}


// --------------------------------------------------
// MOCK QUERY HELPERS
// --------------------------------------------------


function createQuery(result, onSession = () => {}, onSelect = () => {}) {
  let value = result;

  const query = {
    sort(sortOptions = {}) {
      if (Array.isArray(value)) {
        const entries = Object.entries(sortOptions);

        value = [...value].sort((a, b) => {
          for (const [field, direction] of entries) {
            const left = a[field];
            const right = b[field];

            if (left < right) return -direction;
            if (left > right) return direction;
          }

          return 0;
        });
      }

      return this;
    },

    skip(count = 0) {
      if (Array.isArray(value)) {
        value = value.slice(count);
      }

      return this;
    },

    limit(count) {
      if (Array.isArray(value) && count !== undefined) {
        value = value.slice(0, count);
      }

      return this;
    },

    select(fields) {
      query.selectedFields = fields;
      onSelect(fields);
      return this;
    },

    read() {
      return this;
    },

    readConcern() {
      return this;
    },

    session(sessionValue) {
      this.sessionValue = sessionValue;
      onSession(sessionValue);
      return this;
    },

    async lean() {
      if (typeof value === "function") {
        return value();
      }

      return value;
    },

    then(resolve, reject) {
      return this.lean().then(resolve, reject);
    }
  };

  return query;
}

function createModels({
  expectedRecords = [],
  metricRecords = [],
  assignments = [createAssignment()],
  grants = [{ active: true, scope: "ORGANIZATION" }],
  user = memberActor,
  userRecordId,
  transactionSessions
} = {}) {
  // --------------------------------------------------
  // FAKE TRANSACTION SESSION
  // --------------------------------------------------

  const fakeSession = {
    id: "FAKE_READ_SESSION"
  };
  const sessions = transactionSessions || [fakeSession];

  const transactionCalls = [];
  let inTransactionCallback = false;

  const runReadTransaction = async operation => {
    transactionCalls.push("START");

    try {
      let result;
      for (const session of sessions) {
        inTransactionCallback = true;
        result = await operation(session);
        inTransactionCallback = false;
      }
      transactionCalls.push("COMMIT");
      return result;
    } catch (error) {
      inTransactionCallback = false;
      transactionCalls.push("ABORT");
      throw error;
    }
  };


  // --------------------------------------------------
  // QUERY CALL TRACKING
  // --------------------------------------------------

  const calls = {
    userFind: [],
    userFindSessions: [],
    userSelectedFields: [],
    expectedFind: [],
    expectedFindSessions: [],
    expectedFindOne: [],
    expectedFindOneSessions: [],
    expectedCountSessions: [],
    metricFind: [],
    metricFindSessions: [],
    metricFindOne: [],
    metricFindOneSessions: [],
    assignmentFind: [],
    assignmentFindSessions: [],
    grantFindOne: [],
    grantFindOneSessions: []
  };


  // --------------------------------------------------
  // MOCK MODELS
  // --------------------------------------------------

  const models = {

    UserModel: {
      findById(id) {
        assert.equal(inTransactionCallback, true, "User lookup must occur inside transaction callback");
        calls.userFind.push(id);
        const resolvedUser = typeof user === "function"
          ? user(calls.userFind.length, id)
          : user;
        const userRecord = resolvedUser
          ? {
              _id: userRecordId || resolvedUser.id,
              role: resolvedUser.role,
              active: resolvedUser.active,
              teamId: resolvedUser.teamId || null,
              managerId: resolvedUser.managerId || null,
              employmentStartDate: resolvedUser.employmentStartDate || null,
              employmentEndDate: resolvedUser.employmentEndDate || null
            }
          : null;
        return createQuery(
          userRecord,
          session => calls.userFindSessions.push(session),
          fields => calls.userSelectedFields.push(fields)
        );
      }
    },

    // ----------------------------------------------
    // EXPECTED SUBMISSION
    // ----------------------------------------------

    ExpectedSubmission: {

      find(filter) {
        calls.expectedFind.push(filter);

        const matches = expectedRecords.filter(item => {
          if (
            filter.employeeId &&
            String(item.employeeId) !== String(filter.employeeId)
          ) {
            return false;
          }

          const date = item.reportingDate;

          if (
            filter.reportingDate?.$gte &&
            date < filter.reportingDate.$gte
          ) {
            return false;
          }

          if (
            filter.reportingDate?.$lte &&
            date > filter.reportingDate.$lte
          ) {
            return false;
          }

          if (filter.$or) {
            const authorized = filter.$or.some(condition => {
              const range = condition.reportingDate;

              return (
                date >= range.$gte &&
                date <= range.$lte
              );
            });

            if (!authorized) return false;
          }

          return true;
        });

        return createQuery(matches, session => calls.expectedFindSessions.push(session));
      },


      findOne(filter) {
        calls.expectedFindOne.push(filter);

        const record = expectedRecords.find(item =>
          (!filter._id ||
            String(item._id) === String(filter._id)) &&

          String(item.employeeId) === String(filter.employeeId) &&

          item.reportingDate === filter.reportingDate &&

          (!filter.submissionId ||
            String(item.submissionId) === String(filter.submissionId))
        );

        return createQuery(record || null, session => calls.expectedFindOneSessions.push(session));
      },


      countDocuments(filter = {}) {
        const matches = expectedRecords.filter(item => {
          if (
            filter.employeeId &&
            String(item.employeeId) !== String(filter.employeeId)
          ) {
            return false;
          }

          const date = item.reportingDate;

          if (
            filter.reportingDate?.$gte &&
            date < filter.reportingDate.$gte
          ) {
            return false;
          }

          if (
            filter.reportingDate?.$lte &&
            date > filter.reportingDate.$lte
          ) {
            return false;
          }

          if (filter.$or) {
            return filter.$or.some(condition => {
              const range = condition.reportingDate;

              return (
                date >= range.$gte &&
                date <= range.$lte
              );
            });
          }

          return true;
        });

        return createQuery(matches.length, session => calls.expectedCountSessions.push(session));
      }
    },


    // ----------------------------------------------
    // METRIC SUBMISSION
    // ----------------------------------------------

    MetricSubmission: {

      find(filter) {
        calls.metricFind.push(filter);

        return createQuery(metricRecords, session => calls.metricFindSessions.push(session));
      },


      findOne(filter) {
        calls.metricFindOne.push(filter);

        const record = metricRecords.find(item =>
          (!filter._id ||
            String(item._id) === String(filter._id)) &&

          String(item.employeeId) === String(filter.employeeId) &&

          item.reportingDate === filter.reportingDate
        );

        return createQuery(record || null, session => calls.metricFindOneSessions.push(session));
      },


      findById(id) {
        const record = metricRecords.find(item =>
          String(item._id) === String(id)
        );

        const query = createQuery(record || null, session => calls.metricFindOneSessions.push(session));

        return {
          ...query,

          select() {
            return query;
          },

          async lean() {
            return record
              ? {
                  _id: record._id,
                  employeeId: record.employeeId,
                  reportingDate: record.reportingDate
                }
              : null;
          }
        };
      }
    },


    // ----------------------------------------------
    // EMPLOYEE REPORTING ASSIGNMENT
    // ----------------------------------------------

    EmployeeReportingAssignment: {

      find(filter) {
        calls.assignmentFind.push(filter);

        const matching = assignments.filter(item =>
          String(item.employeeId) === String(filter.employeeId) &&

          item.effectiveStartDate <=
            filter.effectiveStartDate.$lte &&

          (
            item.effectiveEndDate == null ||

            item.effectiveEndDate >=
              filter.$or[1].effectiveEndDate.$gte
          )
        );

        return createQuery(matching, session => calls.assignmentFindSessions.push(session));
      }
    },


    // ----------------------------------------------
    // SUBMISSION ACCESS GRANT
    // ----------------------------------------------

    SubmissionAccessGrant: {

      findOne(filter) {
        calls.grantFindOne.push(filter);

        const matching = grants.find(grant =>
          grant.active === true &&
          grant.scope === filter.scope
        );

        return createQuery(matching || null, session => calls.grantFindOneSessions.push(session));
      }
    },


    // ----------------------------------------------
    // MOCK TRANSACTION RUNNER
    // ----------------------------------------------

    runReadTransaction

  };


  // --------------------------------------------------
  // RETURN TEST FIXTURES
  // --------------------------------------------------

  return {
    models,
    calls,
    transactionCalls,
    fakeSession,
    sessions
  };
}



function expectApiError(promise, status, code) {
  return assert.rejects(promise, error => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

function assertNoReportingDataReads({ calls }) {
  for (const [name, values] of Object.entries(calls)) {
    if (name === "userFind" || name === "userFindSessions" || name === "userSelectedFields") continue;
    assert.deepEqual(values, [], name + " should not run for a rejected role.");
  }
}

async function expectOwnDayIntegrityFailure(expected, submission) {
  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });
  await expectApiError(
    getOwnDay({ authenticatedUserId: EMPLOYEE_ID, reportingDate: REPORTING_DATE, models }),
    500,
    "DATA_INTEGRITY_ERROR"
  );
}


// --------------------------------------------------
// TEAM MEMBER: OWN DAY
// --------------------------------------------------

test("Team Member can retrieve their own submitted day", async () => {
  const expected = createExpected();
  const submission = createMetricSubmission();

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  const result = await getOwnDay({
    authenticatedUserId: EMPLOYEE_ID,
    reportingDate: REPORTING_DATE,
    models
  });

  assert.equal(result.employeeId, EMPLOYEE_ID);
  assert.equal(result.status, "On-Time");
  assert.equal(result.submission.status, "On-Time");
  assert.equal(result.submission.metrics.ticketsAssigned, 20);
});

test("Team Member can retrieve a Pending reporting day", async () => {
  const expected = createExpected({
    status: "Pending",
    submissionId: null
  });

  const { models } = createModels({
    expectedRecords: [expected]
  });

  const result = await getOwnDay({
    authenticatedUserId: EMPLOYEE_ID,
    reportingDate: REPORTING_DATE,
    models
  });

  assert.equal(result.status, "Pending");
  assert.equal(result.submission, null);
});

test("Team Member cannot retrieve another employee's day", async () => {
  const { models } = createModels();

  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      models: {
        ...models,
        ExpectedSubmission: models.ExpectedSubmission
      }
    }),
    404,
    "NOT_FOUND"
  );
});

test("Inactive Team Member can retrieve a past reporting day", async () => {
  const expected = createExpected({
    reportingDate: REPORTING_DATE,
    status: "Pending",
    submissionId: null
  });
  const fixture = createModels({ user: inactiveMemberActor, expectedRecords: [expected] });
  let clockCalls = 0;

  const result = await getOwnDay({
    authenticatedUserId: EMPLOYEE_ID,
    reportingDate: REPORTING_DATE,
    clock: () => { clockCalls += 1; return new Date("2026-11-14T00:00:00.000Z"); },
    models: fixture.models
  });

  assert.equal(clockCalls, 1);
  assert.equal(result.reportingDate, REPORTING_DATE);
  assert.deepEqual(fixture.calls.expectedFindOneSessions, [fixture.fakeSession]);
});

test("Active Team Member can retrieve both current and historical reporting days", async () => {
  const yesterday = createExpected({
    reportingDate: REPORTING_DATE,
    status: "Pending",
    submissionId: null
  });
  const today = createExpected({
    reportingDate: IST_TODAY,
    status: "Pending",
    submissionId: null
  });
  const fixture = createModels({ expectedRecords: [yesterday, today] });
  const clock = () => new Date("2026-11-14T00:00:00.000Z");

  const historical = await getOwnDay({
    authenticatedUserId: EMPLOYEE_ID,
    reportingDate: REPORTING_DATE,
    clock,
    models: fixture.models
  });
  const current = await getOwnDay({
    authenticatedUserId: EMPLOYEE_ID,
    reportingDate: IST_TODAY,
    clock,
    models: fixture.models
  });

  assert.equal(historical.reportingDate, REPORTING_DATE);
  assert.equal(current.reportingDate, IST_TODAY);
});

test("Inactive Team Member cannot retrieve today's reporting day", async () => {
  const fixture = createModels({ user: inactiveMemberActor });
  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: IST_TODAY,
      clock: () => new Date("2026-11-14T00:00:00.000Z"),
      models: fixture.models
    }),
    403,
    "ACCOUNT_INACTIVE"
  );
  assertNoReportingDataReads(fixture);
});

test("Inactive Team Member cannot retrieve a future reporting day", async () => {
  const fixture = createModels({ user: inactiveMemberActor });
  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: "2026-11-15",
      clock: () => new Date("2026-11-14T00:00:00.000Z"),
      models: fixture.models
    }),
    403,
    "ACCOUNT_INACTIVE"
  );
  assertNoReportingDataReads(fixture);
});

test("Invalid request clock is rejected before opening a transaction", async () => {
  const fixture = createModels();
  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      clock: () => new Date("invalid"),
      models: fixture.models
    }),
    503,
    "DATABASE_UNAVAILABLE"
  );
  assert.deepEqual(fixture.transactionCalls, []);
  assert.deepEqual(fixture.calls.userFind, []);
});

test("Team Lead cannot use getOwnDay after persisted actor resolution", async () => {
  const fixture = createModels({ user: teamLeadActor });
  await expectApiError(
    getOwnDay({ authenticatedUserId: TEAM_LEAD_ID, reportingDate: REPORTING_DATE, models: fixture.models }),
    403,
    "FORBIDDEN"
  );
  assertNoReportingDataReads(fixture);
  assert.deepEqual(fixture.calls.userFind, [TEAM_LEAD_ID]);
  assert.deepEqual(fixture.calls.userFindSessions, [fixture.fakeSession]);
  assert.deepEqual(fixture.transactionCalls, ["START", "ABORT"]);
});

test("Project Manager cannot use getOwnDay after persisted actor resolution", async () => {
  const fixture = createModels({ user: projectManagerActor });
  await expectApiError(
    getOwnDay({ authenticatedUserId: PM_ID, reportingDate: REPORTING_DATE, models: fixture.models }),
    403,
    "FORBIDDEN"
  );
  assertNoReportingDataReads(fixture);
  assert.deepEqual(fixture.calls.userFind, [PM_ID]);
  assert.deepEqual(fixture.calls.userFindSessions, [fixture.fakeSession]);
  assert.deepEqual(fixture.transactionCalls, ["START", "ABORT"]);
});

test("Invalid reporting date is rejected", async () => {
  const { models } = createModels();

  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: "2026-02-30",
      models
    }),
    400,
    "INVALID_REPORTING_DATE"
  );
});

test("Missing expected employee-day returns 404", async () => {
  const { models } = createModels();

  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      models
    }),
    404,
    "NOT_FOUND"
  );
});


// --------------------------------------------------
// TEAM MEMBER: CURRENT DAY
// --------------------------------------------------

test("Current-day lookup derives reporting date from the clock", async () => {
  const expected = createExpected();
  const submission = createMetricSubmission();

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  const result = await getOwnCurrent({
    authenticatedUserId: EMPLOYEE_ID,
    clock: () => new Date("2026-11-13T06:00:00.000Z"),
    models
  });

  assert.equal(result.reportingDate, REPORTING_DATE);
});

test("Team Lead cannot use getOwnCurrent after persisted actor resolution", async () => {
  const fixture = createModels({ user: teamLeadActor });
  let clockCalls = 0;
  await expectApiError(
    getOwnCurrent({
      authenticatedUserId: TEAM_LEAD_ID,
      clock: () => { clockCalls += 1; return SUBMITTED_AT; },
      models: fixture.models
    }),
    403,
    "FORBIDDEN"
  );
  assert.equal(clockCalls, 1);
  assertNoReportingDataReads(fixture);
  assert.deepEqual(fixture.calls.userFindSessions, [fixture.fakeSession]);
  assert.deepEqual(fixture.transactionCalls, ["START", "ABORT"]);
});

test("Project Manager cannot use getOwnCurrent after persisted actor resolution", async () => {
  const fixture = createModels({ user: projectManagerActor });
  let clockCalls = 0;
  await expectApiError(
    getOwnCurrent({
      authenticatedUserId: PM_ID,
      clock: () => { clockCalls += 1; return SUBMITTED_AT; },
      models: fixture.models
    }),
    403,
    "FORBIDDEN"
  );
  assert.equal(clockCalls, 1);
  assertNoReportingDataReads(fixture);
  assert.deepEqual(fixture.calls.userFindSessions, [fixture.fakeSession]);
  assert.deepEqual(fixture.transactionCalls, ["START", "ABORT"]);
});


test("Inactive Team Member cannot use getOwnCurrent before reporting queries", async () => {
  const fixture = createModels({ user: inactiveMemberActor });
  let clockCalls = 0;
  await expectApiError(
    getOwnCurrent({
      authenticatedUserId: EMPLOYEE_ID,
      clock: () => { clockCalls += 1; return new Date("2026-11-14T00:00:00.000Z"); },
      models: fixture.models
    }),
    403,
    "ACCOUNT_INACTIVE"
  );
  assert.equal(clockCalls, 1);
  assertNoReportingDataReads(fixture);
});

test("Current reporting date and clock capture remain stable across transaction retries", async () => {
  const sessionOne = { id: "CURRENT_CLOCK_SESSION_ONE" };
  const sessionTwo = { id: "CURRENT_CLOCK_SESSION_TWO" };
  const clockDate = new Date("2026-11-14T00:00:00.000Z");
  const expected = createExpected({
    reportingDate: IST_TODAY,
    status: "Pending",
    submissionId: null
  });
  const fixture = createModels({
    expectedRecords: [expected],
    transactionSessions: [sessionOne, sessionTwo]
  });
  let clockCalls = 0;
  let attempt = 0;
  const baseRunner = fixture.models.runReadTransaction;
  fixture.models.runReadTransaction = operation => baseRunner(session => {
    attempt += 1;
    if (attempt === 2) {
      clockDate.setTime(new Date("2026-11-15T00:00:00.000Z").getTime());
    }
    return operation(session);
  });

  await getOwnCurrent({
    authenticatedUserId: EMPLOYEE_ID,
    clock: () => { clockCalls += 1; return clockDate; },
    models: fixture.models
  });

  assert.equal(clockCalls, 1);
  assert.deepEqual(fixture.calls.userFind, [EMPLOYEE_ID, EMPLOYEE_ID]);
  assert.deepEqual(fixture.calls.userFindSessions, [sessionOne, sessionTwo]);
  assert.deepEqual(fixture.calls.expectedFindOne.map(filter => filter.reportingDate), [IST_TODAY, IST_TODAY]);
  assert.deepEqual(fixture.calls.expectedFindOneSessions, [sessionOne, sessionTwo]);
});

// --------------------------------------------------
// TEAM MEMBER: HISTORY
// --------------------------------------------------

test("Team Member can retrieve paginated history", async () => {
  const first = createExpected({
    reportingDate: "2026-11-13"
  });

  const second = createExpected({
    reportingDate: "2026-11-12",
    submissionId: null,
    status: "Pending"
  });

  const { models, calls } = createModels({
    expectedRecords: [first, second],
    metricRecords: [createMetricSubmission()]
  });

  const result = await getOwnHistory({
    authenticatedUserId: EMPLOYEE_ID,
    fromDate: "2026-11-01",
    toDate: "2026-11-13",
    page: 1,
    limit: 20,
    models
  });

  assert.equal(result.records.length, 2);
  assert.equal(result.pagination.total, 2);
  assert.equal(result.pagination.page, 1);
  assert.equal(calls.expectedFind.length, 1);
});

test("Inactive Team Member can retrieve history ending yesterday", async () => {
  const expected = createExpected({
    reportingDate: REPORTING_DATE,
    status: "Pending",
    submissionId: null
  });
  const fixture = createModels({ user: inactiveMemberActor, expectedRecords: [expected] });
  const result = await getOwnHistory({
    authenticatedUserId: EMPLOYEE_ID,
    fromDate: "2026-11-12",
    toDate: REPORTING_DATE,
    clock: () => new Date("2026-11-14T00:00:00.000Z"),
    models: fixture.models
  });

  assert.equal(result.records.length, 1);
  assert.deepEqual(fixture.calls.expectedFindSessions, [fixture.fakeSession]);
  assert.deepEqual(fixture.calls.expectedCountSessions, [fixture.fakeSession]);
});

test("Inactive Team Member cannot retrieve history ending today", async () => {
  const fixture = createModels({ user: inactiveMemberActor });
  await expectApiError(
    getOwnHistory({
      authenticatedUserId: EMPLOYEE_ID,
      fromDate: "2026-11-12",
      toDate: IST_TODAY,
      clock: () => new Date("2026-11-14T00:00:00.000Z"),
      models: fixture.models
    }),
    403,
    "ACCOUNT_INACTIVE"
  );
  assertNoReportingDataReads(fixture);
});

test("Inactive Team Member cannot retrieve history ending in the future", async () => {
  const fixture = createModels({ user: inactiveMemberActor });
  await expectApiError(
    getOwnHistory({
      authenticatedUserId: EMPLOYEE_ID,
      fromDate: "2026-11-12",
      toDate: "2026-11-15",
      clock: () => new Date("2026-11-14T00:00:00.000Z"),
      models: fixture.models
    }),
    403,
    "ACCOUNT_INACTIVE"
  );
  assertNoReportingDataReads(fixture);
});

test("Inactive overlapping history is rejected entirely without clipping", async () => {
  const fixture = createModels({
    user: inactiveMemberActor,
    expectedRecords: [createExpected({ reportingDate: REPORTING_DATE })]
  });
  await expectApiError(
    getOwnHistory({
      authenticatedUserId: EMPLOYEE_ID,
      fromDate: "2026-11-01",
      toDate: IST_TODAY,
      clock: () => new Date("2026-11-14T00:00:00.000Z"),
      models: fixture.models
    }),
    403,
    "ACCOUNT_INACTIVE"
  );
  assertNoReportingDataReads(fixture);
});

test("Inactive history cutoff remains stable across transaction callback retries", async () => {
  const sessionOne = { id: "HISTORY_CLOCK_SESSION_ONE" };
  const sessionTwo = { id: "HISTORY_CLOCK_SESSION_TWO" };
  const clockDate = new Date("2026-11-14T00:00:00.000Z");
  const expected = createExpected({
    reportingDate: REPORTING_DATE,
    status: "Pending",
    submissionId: null
  });
  const fixture = createModels({
    user: inactiveMemberActor,
    expectedRecords: [expected],
    transactionSessions: [sessionOne, sessionTwo]
  });
  let clockCalls = 0;
  let attempt = 0;
  const baseRunner = fixture.models.runReadTransaction;
  fixture.models.runReadTransaction = operation => baseRunner(session => {
    attempt += 1;
    if (attempt === 2) {
      clockDate.setTime(new Date("2026-11-13T00:00:00.000Z").getTime());
    }
    return operation(session);
  });

  await getOwnHistory({
    authenticatedUserId: EMPLOYEE_ID,
    fromDate: "2026-11-12",
    toDate: REPORTING_DATE,
    clock: () => { clockCalls += 1; return clockDate; },
    models: fixture.models
  });

  assert.equal(clockCalls, 1);
  assert.deepEqual(fixture.calls.userFind, [EMPLOYEE_ID, EMPLOYEE_ID]);
  assert.deepEqual(fixture.calls.userFindSessions, [sessionOne, sessionTwo]);
  assert.deepEqual(fixture.calls.expectedFindSessions, [sessionOne, sessionTwo]);
  assert.deepEqual(fixture.calls.expectedCountSessions, [sessionOne, sessionTwo]);
});

test("Self-service actor and reporting queries share the transaction session for all three operations", async () => {
  const expected = createExpected();
  const submission = createMetricSubmission();

  const day = createModels({ expectedRecords: [expected], metricRecords: [submission] });
  await getOwnDay({ authenticatedUserId: EMPLOYEE_ID, reportingDate: REPORTING_DATE, models: day.models });
  assert.deepEqual(day.calls.userFind, [EMPLOYEE_ID]);
  assert.deepEqual(day.calls.userFindSessions, [day.fakeSession]);
  assert.deepEqual(day.calls.userSelectedFields, ["_id role active teamId managerId employmentStartDate employmentEndDate"]);
  assert.deepEqual(day.calls.expectedFindOneSessions, [day.fakeSession]);
  assert.deepEqual(day.calls.metricFindOneSessions, [day.fakeSession]);

  const current = createModels({ expectedRecords: [expected], metricRecords: [submission] });
  await getOwnCurrent({
    authenticatedUserId: EMPLOYEE_ID,
    clock: () => new Date("2026-11-13T06:00:00.000Z"),
    models: current.models
  });
  assert.deepEqual(current.calls.userFindSessions, [current.fakeSession]);
  assert.deepEqual(current.calls.expectedFindOneSessions, [current.fakeSession]);
  assert.deepEqual(current.calls.metricFindOneSessions, [current.fakeSession]);

  const history = createModels({ expectedRecords: [expected], metricRecords: [submission] });
  await getOwnHistory({
    authenticatedUserId: EMPLOYEE_ID,
    fromDate: "2026-11-01",
    toDate: "2026-11-13",
    models: history.models
  });
  assert.deepEqual(history.calls.userFindSessions, [history.fakeSession]);
  assert.deepEqual(history.calls.expectedFindSessions, [history.fakeSession]);
  assert.deepEqual(history.calls.expectedCountSessions, [history.fakeSession]);
  assert.deepEqual(history.calls.metricFindOneSessions, [history.fakeSession]);
});

test("Missing, invalid, or mismatched read actors stop before reporting-data queries", async t => {
  await t.test("missing persisted User", async () => {
    const fixture = createModels({ user: null });
    await expectApiError(
      getOwnDay({ authenticatedUserId: EMPLOYEE_ID, reportingDate: REPORTING_DATE, models: fixture.models }),
      401,
      "UNAUTHENTICATED"
    );
    assertNoReportingDataReads(fixture);
    assert.deepEqual(fixture.calls.userFindSessions, [fixture.fakeSession]);
  });

  await t.test("invalid authenticated ID", async () => {
    const fixture = createModels();
    await expectApiError(
      getOwnDay({ authenticatedUserId: "bad-id", reportingDate: REPORTING_DATE, models: fixture.models }),
      401,
      "UNAUTHENTICATED"
    );
    assertNoReportingDataReads(fixture);
    assert.deepEqual(fixture.calls.userFind, []);
    assert.deepEqual(fixture.calls.userFindSessions, []);
  });

  await t.test("persisted actor ID mismatch", async () => {
    const fixture = createModels({ userRecordId: TEAM_LEAD_ID });
    await expectApiError(
      getOwnDay({ authenticatedUserId: EMPLOYEE_ID, reportingDate: REPORTING_DATE, models: fixture.models }),
      401,
      "UNAUTHENTICATED"
    );
    assertNoReportingDataReads(fixture);
    assert.deepEqual(fixture.calls.userFind, [EMPLOYEE_ID]);
  });
});

test("Read actor is reloaded with the same authenticated ID and each retry session", async () => {
  const sessionOne = { id: "RETRY_SESSION_ONE" };
  const sessionTwo = { id: "RETRY_SESSION_TWO" };
  const expected = createExpected();
  const submission = createMetricSubmission();
  const fixture = createModels({
    expectedRecords: [expected],
    metricRecords: [submission],
    transactionSessions: [sessionOne, sessionTwo],
    user: attempt => ({
      ...memberActor,
      role: attempt === 1 ? "team_member" : "team_lead"
    })
  });

  await expectApiError(
    getOwnDay({ authenticatedUserId: EMPLOYEE_ID, reportingDate: REPORTING_DATE, models: fixture.models }),
    403,
    "FORBIDDEN"
  );

  assert.deepEqual(fixture.calls.userFind, [EMPLOYEE_ID, EMPLOYEE_ID]);
  assert.deepEqual(fixture.calls.userFindSessions, [sessionOne, sessionTwo]);
  assert.deepEqual(fixture.calls.expectedFindOneSessions, [sessionOne]);
  assert.deepEqual(fixture.calls.metricFindOneSessions, [sessionOne]);
  assert.deepEqual(fixture.transactionCalls, ["START", "ABORT"]);
});

test("Team Lead cannot use Team Member history endpoint", async () => {
  const { models } = createModels({ user: teamLeadActor });

  await expectApiError(
    getOwnHistory({
      authenticatedUserId: TEAM_LEAD_ID,
      fromDate: "2026-11-01",
      toDate: "2026-11-13",
      models
    }),
    403,
    "FORBIDDEN"
  );
});

test("Invalid history date range is rejected", async () => {
  const { models } = createModels();

  await expectApiError(
    getOwnHistory({
      authenticatedUserId: EMPLOYEE_ID,
      fromDate: "2026-11-14",
      toDate: "2026-11-01",
      models
    }),
    400,
    "VALIDATION_ERROR"
  );
});

test("Invalid pagination is rejected", async () => {
  const { models } = createModels();

  await expectApiError(
    getOwnHistory({
      authenticatedUserId: EMPLOYEE_ID,
      fromDate: "2026-11-01",
      toDate: "2026-11-13",
      page: 0,
      limit: 20,
      models
    }),
    400,
    "VALIDATION_ERROR"
  );
});


// --------------------------------------------------
// TEAM LEAD: EMPLOYEE DAY
// --------------------------------------------------

test("Team Lead can retrieve an assigned employee's day", async () => {
  const expected = createExpected();
  const submission = createMetricSubmission();

  const { models, calls, fakeSession } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  const result = await getEmployeeDay({
    actor: teamLeadActor,
    employeeId: EMPLOYEE_ID,
    reportingDate: REPORTING_DATE,
    models
  });

  assert.equal(result.employeeId, EMPLOYEE_ID);
  assert.equal(result.status, "On-Time");
  assert.deepEqual(calls.assignmentFindSessions, [fakeSession]);
  assert.deepEqual(calls.expectedFindOneSessions, [fakeSession]);
  assert.deepEqual(calls.metricFindOneSessions, [fakeSession]);
});

test("Team Lead cannot retrieve an employee outside their assignment", async () => {
  const expected = createExpected();

  const { models } = createModels({
    expectedRecords: [expected],
    assignments: []
  });

  await expectApiError(
    getEmployeeDay({
      actor: teamLeadActor,
      employeeId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      models
    }),
    403,
    "FORBIDDEN"
  );
});


// --------------------------------------------------
// TEAM LEAD: EMPLOYEE HISTORY
// --------------------------------------------------

test("Team Lead can retrieve history within their assignment period", async () => {
  const records = [
    createExpected({
      reportingDate: "2026-11-13"
    }),
    createExpected({
      reportingDate: "2026-11-12",
      submissionId: null,
      status: "Pending"
    })
  ];

  const { models, calls, fakeSession } = createModels({
    expectedRecords: records,
    metricRecords: [createMetricSubmission()]
  });

  const result = await getEmployeeHistory({
    actor: teamLeadActor,
    employeeId: EMPLOYEE_ID,
    fromDate: "2026-11-12",
    toDate: "2026-11-13",
    models
  });

  assert.equal(result.records.length, 2);
  assert.equal(calls.assignmentFind.length, 3);
  assert.deepEqual(calls.assignmentFindSessions, [fakeSession, fakeSession, fakeSession]);
  assert.deepEqual(calls.expectedFindSessions, [fakeSession]);
  assert.deepEqual(calls.expectedCountSessions, [fakeSession]);
  assert.deepEqual(calls.metricFindOneSessions, [fakeSession, fakeSession]);
});


// --------------------------------------------------
// PROJECT MANAGER: ORGANIZATION ACCESS
// --------------------------------------------------

test("Project Manager can retrieve organization reporting day", async () => {
  const expected = createExpected();
  const submission = createMetricSubmission();

  const { models, calls, fakeSession } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  const result = await getOrganizationDay({
    actor: projectManagerActor,
    reportingDate: REPORTING_DATE,
    models
  });

  assert.equal(result.reportingDate, REPORTING_DATE);
  assert.equal(result.records.length, 1);
  assert.equal(calls.grantFindOne.length, 1);
  assert.deepEqual(calls.grantFindOneSessions, [fakeSession]);
  assert.deepEqual(calls.expectedFindSessions, [fakeSession]);
  assert.deepEqual(calls.expectedCountSessions, [fakeSession]);
  assert.deepEqual(calls.metricFindOneSessions, [fakeSession]);
});

test("Team Lead cannot access organization-wide reporting", async () => {
  const { models } = createModels();

  await expectApiError(
    getOrganizationDay({
      actor: teamLeadActor,
      reportingDate: REPORTING_DATE,
      models
    }),
    403,
    "FORBIDDEN"
  );
});

test("Project Manager can retrieve organization history", async () => {
  const expected = createExpected();
  const submission = createMetricSubmission();

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  const result = await getOrganizationHistory({
    actor: projectManagerActor,
    fromDate: "2026-11-01",
    toDate: REPORTING_DATE,
    models
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.pagination.total, 1);
});

test("Project Manager without active grant is denied", async () => {
  const { models } = createModels({
    grants: []
  });

  await expectApiError(
    getOrganizationDay({
      actor: projectManagerActor,
      reportingDate: REPORTING_DATE,
      models
    }),
    403,
    "FORBIDDEN"
  );
});


// --------------------------------------------------
// SUBMISSION DETAIL
// --------------------------------------------------

test("Authorized Team Member can retrieve submission detail", async () => {
  const expected = createExpected();
  const submission = createMetricSubmission();

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  const result = await getSubmissionDetail({
    actor: memberActor,
    submissionId: SUBMISSION_ID,
    models
  });

  assert.equal(result.submission.submissionId, SUBMISSION_ID);
  assert.equal(result.status, "On-Time");
});

test("Invalid submission identifier is rejected", async () => {
  const { models } = createModels();

  await expectApiError(
    getSubmissionDetail({
      actor: memberActor,
      submissionId: "invalid-id",
      models
    }),
    400,
    "VALIDATION_ERROR"
  );
});

test("Nonexistent submission detail returns 404", async () => {
  const { models } = createModels();

  await expectApiError(
    getSubmissionDetail({
      actor: memberActor,
      submissionId: SUBMISSION_ID,
      models
    }),
    404,
    "NOT_FOUND"
  );
});


// --------------------------------------------------
// DATA INTEGRITY
// --------------------------------------------------

test("Submitted expected record without metric document fails integrity check", async () => {
  const expected = createExpected();

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: []
  });

  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      models
    }),
    500,
    "DATA_INTEGRITY_ERROR"
  );
});

test("Expected and metric submission status mismatch fails integrity check", async () => {
  const expected = createExpected({
    status: "Late"
  });

  const submission = createMetricSubmission({
    status: "On-Time"
  });

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      models
    }),
    500,
    "DATA_INTEGRITY_ERROR"
  );
});

test("Expected and metric policy version mismatch fails integrity check", async () => {
  const expected = createExpected({
    policyVersion: "POLICY-V2"
  });

  const submission = createMetricSubmission({
    policyVersion: "POLICY-V1"
  });

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      models
    }),
    500,
    "DATA_INTEGRITY_ERROR"
  );
});


// --------------------------------------------------
// KNOWN GAPS — IMPLEMENT BEFORE ENABLING GET ROUTES
// --------------------------------------------------


test("Pending expected day with an orphan MetricSubmission fails integrity check", async () => {
  const expected = createExpected({
    status: "Pending",
    submissionId: null
  });

  const orphan = createMetricSubmission();

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [orphan]
  });

  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      models
    }),
    500,
    "DATA_INTEGRITY_ERROR"
  );
});

test("Missing expected day with an orphan MetricSubmission fails integrity check", async () => {
  const expected = createExpected({
    status: "Missing",
    submissionId: null
  });

  const orphan = createMetricSubmission();

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [orphan]
  });

  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      models
    }),
    500,
    "DATA_INTEGRITY_ERROR"
  );
});

test("Excluded expected day with an orphan MetricSubmission fails integrity check", async () => {
  const expected = createExpected({
    expected: false,
    status: "Excluded",
    submissionId: null,
    reasonCode: "HOLIDAY"
  });

  const orphan = createMetricSubmission();

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [orphan]
  });

  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      models
    }),
    500,
    "DATA_INTEGRITY_ERROR"
  );
});

test("Submitted record with a mismatched deadline fails integrity check", async () => {
  const expected = createExpected({
    deadlineAt: new Date("2026-11-13T04:00:00.000Z")
  });

  const submission = createMetricSubmission({
    applicableDeadlineAt: new Date("2026-11-13T05:00:00.000Z")
  });

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      models
    }),
    500,
    "DATA_INTEGRITY_ERROR"
  );
});

test("Submitted record with an invalid expected deadline fails integrity check", async () => {
  const expected = createExpected({
    deadlineAt: "not-a-valid-date"
  });

  const submission = createMetricSubmission();

  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  await expectApiError(
    getOwnDay({
      authenticatedUserId: EMPLOYEE_ID,
      reportingDate: REPORTING_DATE,
      models
    }),
    500,
    "DATA_INTEGRITY_ERROR"
  );
});

test("Submitted record with an invalid actualSubmittedAt fails integrity check", async () => {
  const invalidActual = new Date("invalid");
  await expectOwnDayIntegrityFailure(
    createExpected({ statusEvaluatedAt: SUBMITTED_AT }),
    createMetricSubmission({ actualSubmittedAt: invalidActual })
  );
});

test("Submitted record with an invalid statusEvaluatedAt fails integrity check", async () => {
  await expectOwnDayIntegrityFailure(
    createExpected({ statusEvaluatedAt: new Date("invalid") }),
    createMetricSubmission()
  );
});

test("Submitted record with statusEvaluatedAt different from actualSubmittedAt fails integrity check", async () => {
  await expectOwnDayIntegrityFailure(
    createExpected({ statusEvaluatedAt: new Date(SUBMITTED_AT.getTime() + 1) }),
    createMetricSubmission()
  );
});

test("On-Time record submitted after its deadline fails integrity check", async () => {
  const afterDeadline = new Date(DEADLINE.getTime() + 1);
  await expectOwnDayIntegrityFailure(
    createExpected({ status: "On-Time", statusEvaluatedAt: afterDeadline }),
    createMetricSubmission({ actualSubmittedAt: afterDeadline })
  );
});

test("Late record submitted exactly at its deadline fails integrity check", async () => {
  await expectOwnDayIntegrityFailure(
    createExpected({ status: "Late", statusEvaluatedAt: DEADLINE }),
    createMetricSubmission({
      actualSubmittedAt: DEADLINE,
      status: "Late"
    })
  );
});

test("Late record submitted before its deadline fails integrity check", async () => {
  const beforeDeadline = new Date(DEADLINE.getTime() - 1);
  await expectOwnDayIntegrityFailure(
    createExpected({ status: "Late", statusEvaluatedAt: beforeDeadline }),
    createMetricSubmission({
      actualSubmittedAt: beforeDeadline,
      status: "Late"
    })
  );
});

test("On-Time record submitted exactly at its deadline is valid", async () => {
  const atDeadline = new Date(DEADLINE);
  const expected = createExpected({
    status: "On-Time",
    statusEvaluatedAt: atDeadline
  });
  const submission = createMetricSubmission({
    actualSubmittedAt: atDeadline,
    status: "On-Time"
  });
  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  const result = await getOwnDay({ authenticatedUserId: EMPLOYEE_ID, reportingDate: REPORTING_DATE, models });
  assert.equal(result.status, "On-Time");
  assert.equal(result.submission.actualSubmittedAt.getTime(), DEADLINE.getTime());
});

test("Late record submitted after its deadline is valid", async () => {
  const afterDeadline = new Date(DEADLINE.getTime() + 1);
  const expected = createExpected({
    status: "Late",
    statusEvaluatedAt: afterDeadline
  });
  const submission = createMetricSubmission({
    actualSubmittedAt: afterDeadline,
    status: "Late"
  });
  const { models } = createModels({
    expectedRecords: [expected],
    metricRecords: [submission]
  });

  const result = await getOwnDay({ authenticatedUserId: EMPLOYEE_ID, reportingDate: REPORTING_DATE, models });
  assert.equal(result.status, "Late");
  assert.equal(result.submission.actualSubmittedAt.getTime(), afterDeadline.getTime());
});

test("Team Lead history excludes dates outside historical assignments before pagination", async () => {
  const firstSubmissionId = new mongoose.Types.ObjectId();
  const lastSubmissionId = new mongoose.Types.ObjectId();

  const records = [
    createExpected({
      reportingDate: "2026-10-04",
      submissionId: firstSubmissionId
    }),
    createExpected({
      reportingDate: "2026-10-08",
      submissionId: null,
      status: "Pending"
    }),
    createExpected({
      reportingDate: "2026-10-12",
      submissionId: lastSubmissionId
    })
  ];

  const assignments = [
    createAssignment({
      effectiveStartDate: "2026-10-01",
      effectiveEndDate: "2026-10-05"
    }),
    createAssignment({
      teamLeadId: new mongoose.Types.ObjectId(OTHER_LEAD_ID),
      effectiveStartDate: "2026-10-06",
      effectiveEndDate: "2026-10-10"
    }),
    createAssignment({
      effectiveStartDate: "2026-10-11",
      effectiveEndDate: null
    })
  ];

  const metricRecords = [
    createMetricSubmission({
      _id: firstSubmissionId,
      reportingDate: "2026-10-04"
    }),
    createMetricSubmission({
      _id: lastSubmissionId,
      reportingDate: "2026-10-12"
    })
  ];

  const { models, calls } = createModels({
    expectedRecords: records,
    metricRecords,
    assignments
  });

  const result = await getEmployeeHistory({
    actor: teamLeadActor,
    employeeId: EMPLOYEE_ID,
    fromDate: "2026-10-01",
    toDate: "2026-10-15",
    page: 1,
    limit: 1,
    models
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].reportingDate, "2026-10-12");

  assert.equal(result.pagination.total, 2);
  assert.equal(result.pagination.totalPages, 2);

  assert.deepEqual(
    calls.expectedFind[0].$or,
    [
      {
        reportingDate: {
          $gte: "2026-10-01",
          $lte: "2026-10-05"
        }
      },
      {
        reportingDate: {
          $gte: "2026-10-11",
          $lte: "2026-10-15"
        }
      }
    ]
  );
});

test("Team Lead receives an empty result when no historical assignment overlaps the requested period", async () => {
  const assignments = [
    createAssignment({
      effectiveStartDate: "2026-11-01",
      effectiveEndDate: "2026-11-05"
    })
  ];

  const { models, calls } = createModels({
    expectedRecords: [
      createExpected({
        reportingDate: "2026-10-15"
      })
    ],
    assignments
  });

  const result = await getEmployeeHistory({
    actor: teamLeadActor,
    employeeId: EMPLOYEE_ID,
    fromDate: "2026-10-01",
    toDate: "2026-10-20",
    models
  });

  assert.deepEqual(result.records, []);
  assert.equal(result.pagination.total, 0);
  assert.equal(result.pagination.totalPages, 0);

  // No expected reporting records should be queried.
  assert.equal(calls.expectedFind.length, 0);
});
