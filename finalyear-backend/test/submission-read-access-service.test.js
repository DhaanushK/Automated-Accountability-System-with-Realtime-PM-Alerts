import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  assertTeamMemberReadAccess,
  assertTeamLeadHistoricalAccess,
  getTeamLeadAuthorizedDateRanges,
  assertProjectManagerReadAccess
} from "../src/services/submissionReadAccessService.js";

const TEAM_LEAD_ID = "672000000000000000000001";
const EMPLOYEE_ID = "672000000000000000000002";
const OTHER_LEAD_ID = "672000000000000000000003";
const PM_ID = "672000000000000000000004";


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

function createAssignmentModel(records, calls = {}) {
  return {
    find(filter) {
      assert.equal(
        String(filter.employeeId),
        EMPLOYEE_ID
      );

      assert.equal(
        filter.effectiveStartDate.$lte,
        "2026-11-20"
      );

      assert.equal(
        filter.$or[1].effectiveEndDate.$gte,
        "2026-11-20"
      );

      const matching = records.filter(record =>
        String(record.employeeId) === String(filter.employeeId) &&
        record.effectiveStartDate <= filter.effectiveStartDate.$lte &&
        (record.effectiveEndDate == null ||
          record.effectiveEndDate >= filter.$or[1].effectiveEndDate.$gte)
      );

      let value = matching;
      const query = {
        session(session) {
          calls.sessions ??= [];
          calls.sessions.push(session);
          return this;
        },
        read() {
          return this;
        },
        readConcern() {
          return this;
        },
        sort(sortOptions = {}) {
          if (Array.isArray(value)) {
            value = [...value].sort((left, right) => {
              for (const [field, direction] of Object.entries(sortOptions)) {
                if (left[field] < right[field]) return -direction;
                if (left[field] > right[field]) return direction;
              }
              return 0;
            });
          }
          return this;
        },
        skip(count = 0) {
          if (Array.isArray(value)) value = value.slice(count);
          return this;
        },
        limit(count) {
          if (Array.isArray(value) && count !== undefined) value = value.slice(0, count);
          return this;
        },
        select() {
          return this;
        },
        async lean() {
          return value;
        },
        then(resolve, reject) {
          return this.lean().then(resolve, reject);
        },
      };
      return query;
    }
  };
}

function createFailingAssignmentModel() {
  return {
    find() {
      return {
        session() {
          return this;
        },
        read() {
          return this;
        },
        readConcern() {
          return this;
        },
        async lean() {
          throw new Error("Simulated database failure");
        }
      };
    }
  };
}

function expectApiError(promise, status, code) {
  return assert.rejects(promise, error => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}


// --------------------------------------------------
// TEAM MEMBER AUTHORIZATION
// --------------------------------------------------

test("Team Member can access own historical records", () => {
  assert.equal(
    assertTeamMemberReadAccess(
      { id: EMPLOYEE_ID, role: "team_member", active: false },
      EMPLOYEE_ID
    ),
    true
  );
});

test("Team Member cannot access another employee's records", () => {
  assert.throws(
    () => assertTeamMemberReadAccess(
      { id: EMPLOYEE_ID, role: "team_member" },
      TEAM_LEAD_ID
    ),
    { code: "FORBIDDEN", status: 403 }
  );
});

test("Non-Team Member cannot use Team Member authorization", () => {
  assert.throws(
    () => assertTeamMemberReadAccess(
      { id: TEAM_LEAD_ID, role: "team_lead" },
      TEAM_LEAD_ID
    ),
    { code: "FORBIDDEN", status: 403 }
  );
});

test("Invalid employee identifier is rejected", () => {
  assert.throws(
    () => assertTeamMemberReadAccess(
      { id: EMPLOYEE_ID, role: "team_member" },
      "invalid-id"
    ),
    { code: "FORBIDDEN", status: 403 }
  );
});


// --------------------------------------------------
// TEAM LEAD HISTORICAL AUTHORIZATION
// --------------------------------------------------

test("Team Lead can access a historically assigned employee", async () => {
  const session = { id: "TEAM_LEAD_READ_SESSION" };
  const calls = {};
  const result = await assertTeamLeadHistoricalAccess(
    {
      id: TEAM_LEAD_ID,
      role: "team_lead",
      active: true
    },
    {
      employeeId: EMPLOYEE_ID,
      reportingDate: "2026-11-20",
      EmployeeReportingAssignmentModel:
        createAssignmentModel([createAssignment()], calls),
      session
    }
  );

  assert.equal(result.authorized, true);
  assert.equal(result.teamId, "TEAM-ALPHA");
  assert.equal(result.reportingDate, "2026-11-20");
  assert.deepEqual(calls.sessions, [session]);
});

test("Assignment start date is inclusive", async () => {
  const record = createAssignment({
    effectiveStartDate: "2026-11-20"
  });

  const result = await assertTeamLeadHistoricalAccess(
    { id: TEAM_LEAD_ID, role: "team_lead", active: true },
    {
      employeeId: EMPLOYEE_ID,
      reportingDate: "2026-11-20",
      EmployeeReportingAssignmentModel:
        createAssignmentModel([record]),
      session: { id: "assignment-start-session" }
    }
  );

  assert.equal(result.authorized, true);
});

test("Assignment end date is inclusive", async () => {
  const record = createAssignment({
    effectiveEndDate: "2026-11-20"
  });

  const result = await assertTeamLeadHistoricalAccess(
    { id: TEAM_LEAD_ID, role: "team_lead", active: true },
    {
      employeeId: EMPLOYEE_ID,
      reportingDate: "2026-11-20",
      EmployeeReportingAssignmentModel:
        createAssignmentModel([record]),
      session: { id: "assignment-end-session" }
    }
  );

  assert.equal(result.authorized, true);
});

test("No matching assignment denies access", async () => {
  await expectApiError(
    assertTeamLeadHistoricalAccess(
      { id: TEAM_LEAD_ID, role: "team_lead", active: true },
      {
        employeeId: EMPLOYEE_ID,
        reportingDate: "2026-11-20",
        EmployeeReportingAssignmentModel:
          createAssignmentModel([]),
        session: { id: "no-assignment-session" }
      }
    ),
    403,
    "FORBIDDEN"
  );
});

test("Overlapping assignments across Team Leads fail closed", async () => {
  await expectApiError(
    assertTeamLeadHistoricalAccess(
      { id: TEAM_LEAD_ID, role: "team_lead", active: true },
      {
        employeeId: EMPLOYEE_ID,
        reportingDate: "2026-11-20",
        EmployeeReportingAssignmentModel:
          createAssignmentModel([
            createAssignment(),
            createAssignment({
              teamLeadId: new mongoose.Types.ObjectId(OTHER_LEAD_ID)
            })
          ]),
        session: { id: "overlap-session" }
      }
    ),
    500,
    "DATA_INTEGRITY_ERROR"
  );
});

test("Assignment belonging to another Team Lead denies access", async () => {
  await expectApiError(
    assertTeamLeadHistoricalAccess(
      { id: TEAM_LEAD_ID, role: "team_lead", active: true },
      {
        employeeId: EMPLOYEE_ID,
        reportingDate: "2026-11-20",
        EmployeeReportingAssignmentModel:
          createAssignmentModel([
            createAssignment({
              teamLeadId: new mongoose.Types.ObjectId(OTHER_LEAD_ID)
            })
          ]),
        session: { id: "other-lead-session" }
      }
    ),
    403,
    "FORBIDDEN"
  );
});

test("Inactive Team Lead is denied", async () => {
  await expectApiError(
    assertTeamLeadHistoricalAccess(
      { id: TEAM_LEAD_ID, role: "team_lead", active: false },
      {
        employeeId: EMPLOYEE_ID,
        reportingDate: "2026-11-20",
        EmployeeReportingAssignmentModel:
          createAssignmentModel([createAssignment()])
      }
    ),
    403,
    "FORBIDDEN"
  );
});

test("Invalid reporting date is rejected", async () => {
  await expectApiError(
    assertTeamLeadHistoricalAccess(
      { id: TEAM_LEAD_ID, role: "team_lead", active: true },
      {
        employeeId: EMPLOYEE_ID,
        reportingDate: "2026-02-30",
        EmployeeReportingAssignmentModel:
          createAssignmentModel([])
      }
    ),
    400,
    "INVALID_REPORTING_DATE"
  );
});

test("Assignment database failure returns 503", async () => {
  await expectApiError(
    assertTeamLeadHistoricalAccess(
      { id: TEAM_LEAD_ID, role: "team_lead", active: true },
      {
        employeeId: EMPLOYEE_ID,
        reportingDate: "2026-11-20",
        EmployeeReportingAssignmentModel:
          createFailingAssignmentModel(),
        session: { id: "assignment-failure-session" }
      }
    ),
    503,
    "DATABASE_UNAVAILABLE"
  );
});


// --------------------------------------------------
// PROJECT MANAGER AUTHORIZATION
// --------------------------------------------------

function createGrantModel(grant) {
  return {
    findOne(query) {
      assert.equal(String(query.userId), PM_ID);
      assert.equal(query.scope, "ORGANIZATION");
      assert.equal(query.active, true);

      return {
        session() {
          return this;
        },
        async lean() {
          return grant;
        }
      };
    }
  };
}

test("Active Project Manager with active grant is authorized", async () => {
  const result = await assertProjectManagerReadAccess(
    {
      id: PM_ID,
      role: "project_manager",
      active: true
    },
    {
      SubmissionAccessGrantModel:
        createGrantModel({ active: true, scope: "ORGANIZATION" }),
      session: { id: "project-manager-read-session" }
    }
  );

  assert.equal(result, true);
});

test("Project Manager without active grant is denied", async () => {
  await expectApiError(
    assertProjectManagerReadAccess(
      {
        id: PM_ID,
        role: "project_manager",
        active: true
      },
      {
        SubmissionAccessGrantModel: createGrantModel(null),
        session: { id: "no-grant-session" }
      }
    ),
    403,
    "FORBIDDEN"
  );
});

test("Inactive Project Manager is denied even with grant", async () => {
  await expectApiError(
    assertProjectManagerReadAccess(
      {
        id: PM_ID,
        role: "project_manager",
        active: false
      },
      {
        SubmissionAccessGrantModel:
          createGrantModel({ active: true, scope: "ORGANIZATION" })
      }
    ),
    403,
    "FORBIDDEN"
  );
});

test("Project Manager grant database failure returns 503", async () => {
  await expectApiError(
    assertProjectManagerReadAccess(
      {
        id: PM_ID,
        role: "project_manager",
        active: true
      },
      {
        SubmissionAccessGrantModel: {
          findOne() {
            return {
              session() {
                return this;
              },
              async lean() {
                throw new Error("Simulated database failure");
              }
            };
          },
        },
        session: { id: "grant-failure-session" }
      }
    ),
    503,
    "DATABASE_UNAVAILABLE"
  );
});
