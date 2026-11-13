
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  assertProjectManagerOrganizationAccess,
  createOrganizationAccessGrant,
  revokeOrganizationAccessGrant
} from "../src/services/submissionAccessGrantService.js";

const PM_ID = new mongoose.Types.ObjectId().toString();
const TL_ID = new mongoose.Types.ObjectId().toString();
const GRANT_ID = new mongoose.Types.ObjectId().toString();

function createActor({
  id = PM_ID,
  role = "project_manager",
  active = true
} = {}) {
  return { id, role, active };
}

function createGrant({
  userId = PM_ID,
  active = true
} = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(userId),
    scope: "ORGANIZATION",
    active
  };
}

function createUserModel({
  user = { _id: new mongoose.Types.ObjectId(PM_ID), role: "project_manager" }
} = {}) {
  return {
    findById() {
      return {
        select() {
          return {
            lean: async () => user
          };
        }
      };
    }
  };
}

function createGrantModel({
  existingGrant = null,
  createResult = null,
  updateResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1 },
  createError = null
} = {}) {
  const calls = {
    findOne: [],
    sessions: [],
    create: [],
    updateOne: []
  };

  return {
    calls,

    findOne(query) {
      calls.findOne.push(query);

      return {
        session(session){
          calls.sessions.push(session);
          return this;
        },
        lean: async () => existingGrant
      };
    },

    async create(document) {
      calls.create.push(document);

      if (createError) {
        throw createError;
      }

      return createResult || {
        _id: new mongoose.Types.ObjectId(),
        ...document
      };
    },

    async updateOne(filter, update, options) {
      calls.updateOne.push({ filter, update, options });
      return updateResult;
    }
  };
}

async function expectApiError(promise, status, code) {
  await assert.rejects(promise, error => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

// --------------------------------------------------
// PROJECT MANAGER ORGANIZATION ACCESS
// --------------------------------------------------

test("Project Manager grant lookup uses the supplied session", async () => {
  const actor = createActor();

  const session = { transactionId: "test-read-session" };

  const grantModel = createGrantModel({
    existingGrant: createGrant()
  });

  const result = await assertProjectManagerOrganizationAccess(actor, {
    SubmissionAccessGrantModel: grantModel,
    session
  });

  assert.equal(result, true);
  assert.deepEqual(grantModel.calls.sessions, [session]);
});

test("Active Project Manager with persisted grant is authorized", async () => {
  const actor = createActor();

  const grantModel = createGrantModel({
    existingGrant: createGrant()
  });

  const result = await assertProjectManagerOrganizationAccess(actor, {
    SubmissionAccessGrantModel: grantModel
  });

  assert.equal(result, true);
  assert.equal(grantModel.calls.findOne.length, 1);

  assert.deepEqual(grantModel.calls.findOne[0], {
    userId: new mongoose.Types.ObjectId(PM_ID),
    scope: "ORGANIZATION",
    active: true
  });
});

test("Active Project Manager without persisted grant is forbidden", async () => {
  const grantModel = createGrantModel({
    existingGrant: null
  });

  await expectApiError(
    assertProjectManagerOrganizationAccess(createActor(), {
      SubmissionAccessGrantModel: grantModel
    }),
    403,
    "FORBIDDEN"
  );
});

test("Team Lead cannot access organization scope", async () => {
  const grantModel = createGrantModel();

  await expectApiError(
    assertProjectManagerOrganizationAccess(
      createActor({
        id: TL_ID,
        role: "team_lead"
      }),
      { SubmissionAccessGrantModel: grantModel }
    ),
    403,
    "FORBIDDEN"
  );

  assert.equal(grantModel.calls.findOne.length, 0);
});

test("Inactive Project Manager is denied even with a grant", async () => {
  const grantModel = createGrantModel({
    existingGrant: createGrant()
  });

  await expectApiError(
    assertProjectManagerOrganizationAccess(
      createActor({ active: false }),
      { SubmissionAccessGrantModel: grantModel }
    ),
    403,
    "FORBIDDEN"
  );

  assert.equal(grantModel.calls.findOne.length, 0);
});

test("Invalid Project Manager identifier is rejected", async () => {
  const grantModel = createGrantModel();

  await expectApiError(
    assertProjectManagerOrganizationAccess(
      createActor({ id: "invalid-id" }),
      { SubmissionAccessGrantModel: grantModel }
    ),
    400,
    "VALIDATION_ERROR"
  );

  assert.equal(grantModel.calls.findOne.length, 0);
});

// --------------------------------------------------
// GRANT CREATION
// --------------------------------------------------

test("Valid synthetic organization grant is created", async () => {
  const userModel = createUserModel();

  const grantModel = createGrantModel();

  const result = await createOrganizationAccessGrant({
    userId: PM_ID,
    grantReason: "Synthetic test authorization",
    grantSource: "SIMULATED_AUTHORIZATION",
    provisioningRunId: "test-run-001",
    grantedBy: null,
    models: {
      UserModel: userModel,
      SubmissionAccessGrantModel: grantModel
    }
  });

  assert.equal(result.userId, PM_ID);
  assert.equal(result.scope, "ORGANIZATION");
  assert.equal(result.active, true);

  assert.equal(grantModel.calls.create.length, 1);

  const created = grantModel.calls.create[0];

  assert.equal(String(created.userId), PM_ID);
  assert.equal(created.scope, "ORGANIZATION");
  assert.equal(created.active, true);
  assert.equal(created.grantedBy, null);
  assert.equal(created.grantSource, "SIMULATED_AUTHORIZATION");
  assert.equal(created.grantReason, "Synthetic test authorization");
  assert.equal(created.provisioningRunId, "test-run-001");
});

test("Grant creation rejects a non-Project Manager account", async () => {
  const userModel = createUserModel({
    user: {
      _id: new mongoose.Types.ObjectId(TL_ID),
      role: "team_lead"
    }
  });

  const grantModel = createGrantModel();

  await expectApiError(
    createOrganizationAccessGrant({
      userId: TL_ID,
      grantReason: "Test authorization",
      grantSource: "SIMULATED_AUTHORIZATION",
      provisioningRunId: "test-run-002",
      models: {
        UserModel: userModel,
        SubmissionAccessGrantModel: grantModel
      }
    }),
    403,
    "FORBIDDEN"
  );

  assert.equal(grantModel.calls.create.length, 0);
});

test("Duplicate active organization grant is rejected", async () => {
  const grantModel = createGrantModel({
    existingGrant: createGrant()
  });

  await expectApiError(
    createOrganizationAccessGrant({
      userId: PM_ID,
      grantReason: "Another authorization",
      grantSource: "SIMULATED_AUTHORIZATION",
      provisioningRunId: "test-run-003",
      models: {
        UserModel: createUserModel(),
        SubmissionAccessGrantModel: grantModel
      }
    }),
    409,
    "ACCESS_GRANT_ALREADY_ACTIVE"
  );

  assert.equal(grantModel.calls.create.length, 0);
});

test("Duplicate-key race is reported as an active grant conflict", async () => {
  const duplicateError = new Error("Duplicate key");
  duplicateError.code = 11000;

  const grantModel = createGrantModel({
    existingGrant: null,
    createError: duplicateError
  });

  await expectApiError(
    createOrganizationAccessGrant({
      userId: PM_ID,
      grantReason: "Concurrent authorization",
      grantSource: "SIMULATED_AUTHORIZATION",
      provisioningRunId: "test-run-004",
      models: {
        UserModel: createUserModel(),
        SubmissionAccessGrantModel: grantModel
      }
    }),
    409,
    "ACCESS_GRANT_ALREADY_ACTIVE"
  );
});

test("Grant creation rejects unsupported grant source", async () => {
  const grantModel = createGrantModel();

  await expectApiError(
    createOrganizationAccessGrant({
      userId: PM_ID,
      grantReason: "Test authorization",
      grantSource: "UNVERIFIED",
      provisioningRunId: "test-run-005",
      models: {
        UserModel: createUserModel(),
        SubmissionAccessGrantModel: grantModel
      }
    }),
    400,
    "VALIDATION_ERROR"
  );

  assert.equal(grantModel.calls.create.length, 0);
});

test("Grant creation rejects missing reason", async () => {
  const grantModel = createGrantModel();

  await expectApiError(
    createOrganizationAccessGrant({
      userId: PM_ID,
      grantReason: " ",
      grantSource: "SIMULATED_AUTHORIZATION",
      provisioningRunId: "test-run-006",
      models: {
        UserModel: createUserModel(),
        SubmissionAccessGrantModel: grantModel
      }
    }),
    400,
    "VALIDATION_ERROR"
  );

  assert.equal(grantModel.calls.create.length, 0);
});

// --------------------------------------------------
// GRANT REVOCATION
// --------------------------------------------------

test("Active organization grant is revoked successfully", async () => {
  const grantModel = createGrantModel();

  const result = await revokeOrganizationAccessGrant({
    grantId: GRANT_ID,
    revocationReason: "Synthetic test revocation",
    revokedBy: null,
    models: {
      SubmissionAccessGrantModel: grantModel
    }
  });

  assert.deepEqual(result, {
    grantId: GRANT_ID,
    active: false
  });

  assert.equal(grantModel.calls.updateOne.length, 1);

  const call = grantModel.calls.updateOne[0];

  assert.deepEqual(call.filter, {
    _id: new mongoose.Types.ObjectId(GRANT_ID),
    scope: "ORGANIZATION",
    active: true
  });

  assert.equal(call.update.$set.active, false);
  assert.equal(call.update.$set.revokedBy, null);
  assert.ok(call.update.$set.revokedAt instanceof Date);
  assert.equal(
    call.update.$set.revocationReason,
    "Synthetic test revocation"
  );

  assert.equal(call.options.runValidators, true);
});

test("Already revoked or missing grant cannot be revoked again", async () => {
  const grantModel = createGrantModel({
    updateResult: {
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0
    }
  });

  await expectApiError(
    revokeOrganizationAccessGrant({
      grantId: GRANT_ID,
      revocationReason: "Repeated revocation",
      models: {
        SubmissionAccessGrantModel: grantModel
      }
    }),
    409,
    "ACCESS_GRANT_NOT_ACTIVE"
  );
});

test("Revocation rejects invalid grant identifier", async () => {
  const grantModel = createGrantModel();

  await expectApiError(
    revokeOrganizationAccessGrant({
      grantId: "invalid-id",
      revocationReason: "Test revocation",
      models: {
        SubmissionAccessGrantModel: grantModel
      }
    }),
    400,
    "VALIDATION_ERROR"
  );

  assert.equal(grantModel.calls.updateOne.length, 0);
});

test("Revocation rejects an empty reason", async () => {
  const grantModel = createGrantModel();

  await expectApiError(
    revokeOrganizationAccessGrant({
      grantId: GRANT_ID,
      revocationReason: " ",
      models: {
        SubmissionAccessGrantModel: grantModel
      }
    }),
    400,
    "VALIDATION_ERROR"
  );

  assert.equal(grantModel.calls.updateOne.length, 0);
});
