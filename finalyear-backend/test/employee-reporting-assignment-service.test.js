
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  AssignmentApiError,
  INITIAL_ROSTER_DATE,
  INITIAL_ROSTER_SOURCE,
  validateInitialAssignmentRequest,
  formatAssignmentError,
  createInitialAssignment
} from "../src/services/employeeReportingAssignmentService.js";

const employeeId = new mongoose.Types.ObjectId().toString();
const teamLeadId = new mongoose.Types.ObjectId().toString();

// --------------------------------------------------
// 1. POLICY AND REQUEST VALIDATION TESTS
// --------------------------------------------------

test("initial roster policy uses the approved synthetic source", () => {
  assert.equal(INITIAL_ROSTER_DATE, "2026-10-11");

  assert.equal(
    INITIAL_ROSTER_SOURCE,
    "SYNTHETIC_ROSTER_2026-10-11"
  );
});

test("valid assignment request accepts employee and Team Lead IDs", () => {
  const result = validateInitialAssignmentRequest({
    employeeId,
    teamLeadId
  });

  assert.ok(result.employeeId instanceof mongoose.Types.ObjectId);
  assert.ok(result.teamLeadId instanceof mongoose.Types.ObjectId);

  assert.equal(String(result.employeeId), employeeId);
  assert.equal(String(result.teamLeadId), teamLeadId);
});

test("assignment request rejects null and non-object input", () => {
  for (const request of [null, undefined, "invalid", 123, []]) {
    assert.throws(
      () => validateInitialAssignmentRequest(request),
      error =>
        error instanceof AssignmentApiError &&
        error.status === 400 &&
        error.code === "VALIDATION_ERROR"
    );
  }
});

test("assignment request rejects unsupported fields", () => {
  assert.throws(
    () => validateInitialAssignmentRequest({
      employeeId,
      teamLeadId,
      teamId: "TEAM-ALPHA"
    }),
    error =>
      error instanceof AssignmentApiError &&
      error.code === "VALIDATION_ERROR"
  );
});

test("assignment request rejects invalid employee identifiers", () => {
  assert.throws(
    () => validateInitialAssignmentRequest({
      employeeId: "invalid-id",
      teamLeadId
    }),
    error => error.code === "VALIDATION_ERROR"
  );
});

test("assignment request rejects invalid Team Lead identifiers", () => {
  assert.throws(
    () => validateInitialAssignmentRequest({
      employeeId,
      teamLeadId: "invalid-id"
    }),
    error => error.code === "VALIDATION_ERROR"
  );
});

// --------------------------------------------------
// 2. ERROR FORMATTER TESTS
// --------------------------------------------------

test("assignment error formatter preserves safe client errors", () => {
  const error = new AssignmentApiError(
    400,
    "VALIDATION_ERROR",
    "Invalid assignment request."
  );

  const result = formatAssignmentError(error);

  assert.equal(result.status, 400);
  assert.equal(result.body.success, false);

  assert.equal(
    result.body.error.code,
    "VALIDATION_ERROR"
  );

  assert.equal(
    result.body.error.message,
    "Invalid assignment request."
  );
});

test("assignment error formatter hides internal server messages", () => {
  const error = new AssignmentApiError(
    500,
    "DATA_INTEGRITY_ERROR",
    "Sensitive database details."
  );

  const result = formatAssignmentError(error);

  assert.equal(result.status, 500);

  assert.equal(
    result.body.error.code,
    "DATA_INTEGRITY_ERROR"
  );

  assert.notEqual(
    result.body.error.message,
    "Sensitive database details."
  );
});

// --------------------------------------------------
// 3. MOCK ASSIGNMENT ENVIRONMENT
// --------------------------------------------------

function createMockAssignmentEnvironment({
  employee = {
    role: "team_member",
    teamId: "TEAM-ALPHA"
  },
  teamLead = {
    role: "team_lead",
    teamId: "TEAM-ALPHA"
  },
  existingAssignments = [],
  duplicateKeyOnSave = false,
  unknownCommitAfterCommit = false,
  failMajorityRead = false,
  transientFailureOnFirstSave = false, 
  failSessionStart = false
} = {}) {
  const state = {
    employee: {
      _id: new mongoose.Types.ObjectId(),
      ...employee,
      assignmentRevision: 0
    },

    teamLead: {
      _id: new mongoose.Types.ObjectId(),
      ...teamLead
    },

    assignments: [...existingAssignments],
    concurrentCommittedAssignments: [],
    revisionUpdates: 0,
    saves: 0,

    transactionAttempts: 0,
    transactionCommits: 0,
    transactionAborts: 0,

    duplicateKeyOnSave,
    unknownCommitAfterCommit,
    failMajorityRead,
    transientFailureOnFirstSave,
    failSessionStart,
    saveAttempts: 0,
    sessionStarts: 0,
    sessionEnds: 0,
  };

  // ----------------------------------------------
  // Mock Mongoose query
  // ----------------------------------------------

  function query(result, onSession = null) {
    let inSession = false;
    let majorityRead = false;

    return {
      select() {
        return this;
      },

      session() {
        inSession = true;
        onSession?.();

        return this;
      },

      read() {
        return this;
      },

      readConcern() {
        majorityRead = true;

        return this;
      },

      lean() {
        if (state.failMajorityRead && majorityRead) {
          return Promise.reject(
            new Error("Simulated majority-read failure")
          );
        }

        return Promise.resolve(result(inSession));
      }
    };
  }

  // ----------------------------------------------
  // Mock User model
  // ----------------------------------------------

  const UserModel = {
    findById(id) {
      return query(() => {
        if (String(id) === String(state.employee._id)) {
          return { ...state.employee };
        }

        if (String(id) === String(state.teamLead._id)) {
          return { ...state.teamLead };
        }

        return null;
      });
    },

    async updateOne(filter, update) {
      if (
        String(filter._id) !== String(state.employee._id) ||
        filter.role !== "team_member"
      ) {
        return { matchedCount: 0 };
      }

      state.employee.assignmentRevision +=
        update.$inc.assignmentRevision;

      state.revisionUpdates++;

      return { matchedCount: 1 };
    }
  };

  // ----------------------------------------------
  // Mock EmployeeReportingAssignment model
  // ----------------------------------------------

  class AssignmentModel {
    constructor(data) {
      Object.assign(this, data);

      this._id = new mongoose.Types.ObjectId();
    }

    async save() {
  state.saves++;
  state.saveAttempts++;

  if (state.duplicateKeyOnSave) {
    const competingRecord = {
      ...this,
      _id: new mongoose.Types.ObjectId()
    };

    state.concurrentCommittedAssignments.push(
      competingRecord
    );

    const error = new Error("Duplicate key");
    error.code = 11000;

    throw error;
  }

  if (
    state.transientFailureOnFirstSave &&
    state.saveAttempts === 1
  ) {
    const error = new Error(
      "Simulated transient transaction failure"
    );

    error.name = "MongoServerError";
    error.errorLabels = ["TransientTransactionError"];

    throw error;
  }

  state.assignments.push(this);

  return this;
}

    static findOne(filter) {
      return query(inSession => {
        const matches = state.assignments.filter(record => {
          if (
            String(record.employeeId) !==
            String(filter.employeeId)
          ) {
            return false;
          }

          if (inSession) {
            return (
              record.effectiveEndDate == null ||
              record.effectiveEndDate >= "2026-10-11"
            );
          }

          return (
            record.effectiveStartDate ===
            filter.effectiveStartDate
          );
        });

        return matches[0] || null;
      });
    }
  }

  // ----------------------------------------------
  // Mock MongoDB transaction environment
  // ----------------------------------------------

  const mongooseClient = {
  async startSession() {
    state.sessionStarts++;

    if (state.failSessionStart) {
      const error = new Error(
        "Simulated MongoDB server selection failure"
      );

      error.name = "MongoServerSelectionError";

      throw error;
    }

    return {
      async withTransaction(callback) {
        const maxAttempts = 3;

        for (
          let attempt = 1;
          attempt <= maxAttempts;
          attempt++
        ) {
          state.transactionAttempts++;

          const previousRevision =
            state.employee.assignmentRevision;

          const previousAssignments = [
            ...state.assignments
          ];

          const previousSaves = state.saves;
          const previousRevisionUpdates =
            state.revisionUpdates;

          try {
            await callback();

            state.transactionCommits++;

            // Simulate a lost commit acknowledgement.
            // Committed data remains persisted.
            if (state.unknownCommitAfterCommit) {
              const error = new Error(
                "Simulated unknown transaction commit result"
              );

              error.errorLabels = [
                "UnknownTransactionCommitResult"
              ];

              throw error;
            }

            return;
          } catch (error) {
            // Unknown commit acknowledgement is not
            // a transaction abort.
            if (
              error.errorLabels?.includes(
                "UnknownTransactionCommitResult"
              )
            ) {
              throw error;
            }

            // Roll back this failed transaction attempt.
            state.employee.assignmentRevision =
              previousRevision;

            state.assignments = [
              ...previousAssignments,
              ...state.concurrentCommittedAssignments
            ];

            state.concurrentCommittedAssignments = [];

            state.saves = previousSaves;
            state.revisionUpdates =
              previousRevisionUpdates;

            state.transactionAborts++;

            const isTransient =
              error.errorLabels?.includes(
                "TransientTransactionError"
              );

            if (isTransient && attempt < maxAttempts) {
              continue;
            }

            throw error;
          }
        }
      },

      async endSession() {
        state.sessionEnds++;
      }
    };
  }
};
  return {
    state,

    models: {
      User: UserModel,
      EmployeeReportingAssignment: AssignmentModel
    },

    mongooseClient
  };
}

// --------------------------------------------------
// 4. INITIAL ASSIGNMENT SERVICE TESTS
// --------------------------------------------------

test("initial assignment creates a synthetic roster record", async () => {
  const env = createMockAssignmentEnvironment();

  const result = await createInitialAssignment({
    request: {
      employeeId: String(env.state.employee._id),
      teamLeadId: String(env.state.teamLead._id)
    },

    models: env.models,
    mongooseClient: env.mongooseClient
  });

  assert.equal(result.success, true);
  assert.equal(result.data.isReplay, false);
  assert.equal(result.data.teamId, "TEAM-ALPHA");

  assert.equal(
    result.data.effectiveStartDate,
    "2026-10-11"
  );

  assert.equal(result.data.assignmentType, "INITIAL");
  assert.equal(result.data.sourceType, "SIMULATED_ROSTER");

  assert.equal(
    result.data.sourceReference,
    "SYNTHETIC_ROSTER_2026-10-11"
  );

  assert.equal(env.state.assignments.length, 1);
  assert.equal(env.state.saves, 1);

  assert.equal(
    env.state.employee.assignmentRevision,
    1
  );

  assert.equal(env.state.transactionCommits, 1);
  assert.equal(env.state.transactionAborts, 0);
});

test("initial assignment rejects an incorrect employee role", async () => {
  const env = createMockAssignmentEnvironment({
    employee: {
      role: "team_lead",
      teamId: "TEAM-ALPHA"
    }
  });

  await assert.rejects(
    createInitialAssignment({
      request: {
        employeeId: String(env.state.employee._id),
        teamLeadId: String(env.state.teamLead._id)
      },

      models: env.models,
      mongooseClient: env.mongooseClient
    }),

    error =>
      error.code === "INVALID_EMPLOYEE_ROLE" &&
      error.status === 409
  );

  assert.equal(env.state.assignments.length, 0);

  assert.equal(
    env.state.employee.assignmentRevision,
    0
  );

  assert.equal(env.state.transactionAborts, 1);
});

test("initial assignment rejects an incorrect Team Lead role", async () => {
  const env = createMockAssignmentEnvironment({
    teamLead: {
      role: "team_member",
      teamId: "TEAM-ALPHA"
    }
  });

  await assert.rejects(
    createInitialAssignment({
      request: {
        employeeId: String(env.state.employee._id),
        teamLeadId: String(env.state.teamLead._id)
      },

      models: env.models,
      mongooseClient: env.mongooseClient
    }),

    error =>
      error.code === "INVALID_TEAM_LEAD_ROLE" &&
      error.status === 409
  );

  assert.equal(env.state.assignments.length, 0);

  assert.equal(
    env.state.employee.assignmentRevision,
    0
  );
});

test("initial assignment rejects a team mismatch", async () => {
  const env = createMockAssignmentEnvironment({
    teamLead: {
      role: "team_lead",
      teamId: "TEAM-BETA"
    }
  });

  await assert.rejects(
    createInitialAssignment({
      request: {
        employeeId: String(env.state.employee._id),
        teamLeadId: String(env.state.teamLead._id)
      },

      models: env.models,
      mongooseClient: env.mongooseClient
    }),

    error =>
      error.code === "TEAM_MISMATCH" &&
      error.status === 409
  );

  assert.equal(env.state.assignments.length, 0);

  assert.equal(
    env.state.employee.assignmentRevision,
    0
  );
});

test("initial assignment aborts when an overlapping assignment exists", async () => {
  const env = createMockAssignmentEnvironment({
    existingAssignments: [{
      _id: new mongoose.Types.ObjectId(),

      employeeId: null,

      teamLeadId: new mongoose.Types.ObjectId(),

      teamId: "TEAM-ALPHA",

      effectiveStartDate: "2026-09-01",
      effectiveEndDate: null,

      assignmentType: "INITIAL",
      sourceType: "SIMULATED_ROSTER",
      sourceReference: "PREEXISTING_TEST_RECORD"
    }]
  });

  env.state.assignments[0].employeeId =
    env.state.employee._id;

  await assert.rejects(
    createInitialAssignment({
      request: {
        employeeId: String(env.state.employee._id),
        teamLeadId: String(env.state.teamLead._id)
      },

      models: env.models,
      mongooseClient: env.mongooseClient
    }),

    error =>
      error.code === "ASSIGNMENT_CONFLICT" &&
      error.status === 409
  );

  assert.equal(env.state.assignments.length, 1);
  assert.equal(env.state.saves, 0);

  assert.equal(
    env.state.employee.assignmentRevision,
    0
  );

  assert.equal(env.state.transactionAborts, 1);
});

test("existing identical initial assignment returns an idempotent replay", async () => {
  const env = createMockAssignmentEnvironment();

  const existing = {
    _id: new mongoose.Types.ObjectId(),

    employeeId: env.state.employee._id,
    teamLeadId: env.state.teamLead._id,

    teamId: "TEAM-ALPHA",

    effectiveStartDate: "2026-10-11",
    effectiveEndDate: null,

    assignmentType: "INITIAL",
    sourceType: "SIMULATED_ROSTER",
    sourceReference: "SYNTHETIC_ROSTER_2026-10-11"
  };

  env.state.assignments.push(existing);

  const result = await createInitialAssignment({
    request: {
      employeeId: String(env.state.employee._id),
      teamLeadId: String(env.state.teamLead._id)
    },

    models: env.models,
    mongooseClient: env.mongooseClient
  });

  assert.equal(result.success, true);
  assert.equal(result.data.isReplay, true);

  assert.equal(
    result.data.assignmentId,
    String(existing._id)
  );

  assert.equal(env.state.assignments.length, 1);
  assert.equal(env.state.saves, 0);
  assert.equal(env.state.revisionUpdates, 0);
  assert.equal(env.state.transactionAttempts, 0);
});

test("initial assignment rejects a missing employee", async () => {
  const env = createMockAssignmentEnvironment();

  const missingEmployeeId =
    new mongoose.Types.ObjectId().toString();

  await assert.rejects(
    createInitialAssignment({
      request: {
        employeeId: missingEmployeeId,
        teamLeadId: String(env.state.teamLead._id)
      },

      models: env.models,
      mongooseClient: env.mongooseClient
    }),

    error =>
      error.code === "ACCOUNT_NOT_FOUND" &&
      error.status === 404
  );

  assert.equal(env.state.assignments.length, 0);
  assert.equal(env.state.saves, 0);
});

test("initial assignment rejects a missing Team Lead", async () => {
  const env = createMockAssignmentEnvironment();

  const missingTeamLeadId =
    new mongoose.Types.ObjectId().toString();

  await assert.rejects(
    createInitialAssignment({
      request: {
        employeeId: String(env.state.employee._id),
        teamLeadId: missingTeamLeadId
      },

      models: env.models,
      mongooseClient: env.mongooseClient
    }),

    error =>
      error.code === "ACCOUNT_NOT_FOUND" &&
      error.status === 404
  );

  assert.equal(env.state.assignments.length, 0);
  assert.equal(env.state.saves, 0);
});

test("initial assignment rejects a conflicting existing assignment", async () => {
  const env = createMockAssignmentEnvironment();

  env.state.assignments.push({
    _id: new mongoose.Types.ObjectId(),

    employeeId: env.state.employee._id,
    teamLeadId: new mongoose.Types.ObjectId(),

    teamId: "TEAM-ALPHA",

    effectiveStartDate: "2026-10-11",
    effectiveEndDate: null,

    assignmentType: "INITIAL",
    sourceType: "SIMULATED_ROSTER",
    sourceReference: "SYNTHETIC_ROSTER_2026-10-11"
  });

  await assert.rejects(
    createInitialAssignment({
      request: {
        employeeId: String(env.state.employee._id),
        teamLeadId: String(env.state.teamLead._id)
      },

      models: env.models,
      mongooseClient: env.mongooseClient
    }),

    error =>
      error.code === "ASSIGNMENT_CONFLICT" &&
      error.status === 409
  );

  assert.equal(env.state.assignments.length, 1);
  assert.equal(env.state.saves, 0);
  assert.equal(env.state.revisionUpdates, 0);
});

test("initial assignment permits intentionally inactive synthetic accounts", async () => {
  const env = createMockAssignmentEnvironment({
    employee: {
      role: "team_member",
      teamId: "TEAM-ALPHA",
      active: false
    },

    teamLead: {
      role: "team_lead",
      teamId: "TEAM-ALPHA",
      active: false
    }
  });

  const result = await createInitialAssignment({
    request: {
      employeeId: String(env.state.employee._id),
      teamLeadId: String(env.state.teamLead._id)
    },

    models: env.models,
    mongooseClient: env.mongooseClient
  });

  assert.equal(result.success, true);
  assert.equal(result.data.isReplay, false);

  assert.equal(env.state.employee.active, false);
  assert.equal(env.state.teamLead.active, false);

  assert.equal(env.state.assignments.length, 1);
});

// --------------------------------------------------
// 5. TRANSACTION FAILURE AND RECONCILIATION TESTS
// --------------------------------------------------

test("duplicate-key race reconciles a matching committed assignment", async () => {
  const env = createMockAssignmentEnvironment({
    duplicateKeyOnSave: true
  });

  const result = await createInitialAssignment({
    request: {
      employeeId: String(env.state.employee._id),
      teamLeadId: String(env.state.teamLead._id)
    },
    models: env.models,
    mongooseClient: env.mongooseClient
  });

  assert.equal(result.success, true);
  assert.equal(result.data.isReplay, true);

  assert.equal(
    result.data.employeeId,
    String(env.state.employee._id)
  );

  assert.equal(
    result.data.teamLeadId,
    String(env.state.teamLead._id)
  );

  assert.equal(result.data.teamId, "TEAM-ALPHA");

  assert.equal(env.state.assignments.length, 1);
  assert.equal(env.state.saves, 0);
  assert.equal(env.state.transactionAborts, 1);

  assert.equal(
    env.state.employee.assignmentRevision,
    0
  );
});

test("unknown commit result reconciles a successfully committed assignment", async () => {
  const env = createMockAssignmentEnvironment({
    unknownCommitAfterCommit: true
  });

  const result = await createInitialAssignment({
    request: {
      employeeId: String(env.state.employee._id),
      teamLeadId: String(env.state.teamLead._id)
    },
    models: env.models,
    mongooseClient: env.mongooseClient
  });

  assert.equal(result.success, true);
  assert.equal(result.data.isReplay, true);

  assert.equal(
    result.data.employeeId,
    String(env.state.employee._id)
  );

  assert.equal(
    result.data.teamLeadId,
    String(env.state.teamLead._id)
  );

  assert.equal(env.state.assignments.length, 1);

  assert.equal(
    env.state.employee.assignmentRevision,
    1
  );

  assert.equal(env.state.transactionCommits, 1);
  assert.equal(env.state.transactionAborts, 0);
});

test("unknown commit result returns 503 when majority reconciliation fails", async () => {
  const env = createMockAssignmentEnvironment({
    unknownCommitAfterCommit: true,
    failMajorityRead: true
  });

  await assert.rejects(
    createInitialAssignment({
      request: {
        employeeId: String(env.state.employee._id),
        teamLeadId: String(env.state.teamLead._id)
      },
      models: env.models,
      mongooseClient: env.mongooseClient
    }),

    error =>
      error.code === "ASSIGNMENT_OUTCOME_UNCONFIRMED" &&
      error.status === 503
  );

  // The commit occurred even though the service
  // could not confirm its outcome.

  assert.equal(env.state.assignments.length, 1);

  assert.equal(
    env.state.employee.assignmentRevision,
    1
  );

  assert.equal(env.state.transactionCommits, 1);
  assert.equal(env.state.transactionAborts, 0);
});
// --------------------------------------------------
// 6. TRANSACTION RESILIENCE TESTS
// --------------------------------------------------

test("transient transaction failure retries and succeeds", async () => {
  const env = createMockAssignmentEnvironment({
    transientFailureOnFirstSave: true
  });

  const result = await createInitialAssignment({
    request: {
      employeeId: String(env.state.employee._id),
      teamLeadId: String(env.state.teamLead._id)
    },
    models: env.models,
    mongooseClient: env.mongooseClient
  });

  assert.equal(result.success, true);
  assert.equal(result.data.isReplay, false);

  assert.equal(env.state.transactionAttempts, 2);
  assert.equal(env.state.transactionAborts, 1);
  assert.equal(env.state.transactionCommits, 1);

  assert.equal(env.state.saveAttempts, 2);
  assert.equal(env.state.saves, 1);
  assert.equal(env.state.assignments.length, 1);

  assert.equal(
    env.state.employee.assignmentRevision,
    1
  );

  assert.equal(env.state.sessionStarts, 1);
  assert.equal(env.state.sessionEnds, 1);
});

test("session is cleaned up after a successful transaction", async () => {
  const env = createMockAssignmentEnvironment();

  const result = await createInitialAssignment({
    request: {
      employeeId: String(env.state.employee._id),
      teamLeadId: String(env.state.teamLead._id)
    },
    models: env.models,
    mongooseClient: env.mongooseClient
  });

  assert.equal(result.success, true);
  assert.equal(env.state.sessionStarts, 1);
  assert.equal(env.state.sessionEnds, 1);
});

test("database session failure returns a safe unavailable error", async () => {
  const env = createMockAssignmentEnvironment({
    failSessionStart: true
  });

  await assert.rejects(
    createInitialAssignment({
      request: {
        employeeId: String(env.state.employee._id),
        teamLeadId: String(env.state.teamLead._id)
      },
      models: env.models,
      mongooseClient: env.mongooseClient
    }),
    error =>
      error.code === "DATABASE_UNAVAILABLE" &&
      error.status === 503
  );

  assert.equal(env.state.sessionStarts, 1);
  assert.equal(env.state.sessionEnds, 0);
  assert.equal(env.state.assignments.length, 0);
});
test("session is cleaned up after a transaction callback failure", async () => {
  const env = createMockAssignmentEnvironment({
    employee: {
      role: "team_lead",
      teamId: "TEAM-ALPHA"
    }
  });

  await assert.rejects(
    createInitialAssignment({
      request: {
        employeeId: String(env.state.employee._id),
        teamLeadId: String(env.state.teamLead._id)
      },
      models: env.models,
      mongooseClient: env.mongooseClient
    }),
    error =>
      error.code === "INVALID_EMPLOYEE_ROLE" &&
      error.status === 409
  );

  assert.equal(env.state.sessionStarts, 1);
  assert.equal(env.state.sessionEnds, 1);
  assert.equal(env.state.transactionAborts, 1);
  assert.equal(env.state.assignments.length, 0);
});