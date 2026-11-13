import test from "node:test";
import assert from "node:assert/strict";

import User from "../src/models/User.js";
import {
  loadReadSubmissionActor
} from "../src/services/submissionAccessService.js";

const AUTHENTICATED_ID = "672000000000000000000001";
const OTHER_ID = "672000000000000000000002";
const READ_ACTOR_FIELDS =
  "_id role active teamId managerId employmentStartDate employmentEndDate";

function createUserQuery(user, calls) {
  return {
    select(fields) {
      calls.selectedFields = fields;
      calls.order.push("select");
      return this;
    },
    session(session) {
      calls.session = session;
      calls.order.push("session");
      return this;
    },
    async lean() {
      calls.order.push("lean");
      return user;
    }
  };
}

function createActorUser(overrides = {}) {
  return {
    _id: AUTHENTICATED_ID,
    role: "team_member",
    active: true,
    teamId: "team-alpha",
    managerId: OTHER_ID,
    employmentStartDate: "2026-01-01",
    employmentEndDate: null,
    password: "must-not-be-returned",
    ...overrides
  };
}

function expectAuthError(promise, status, code) {
  return assert.rejects(promise, error => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

test("read actor resolver selects only approved fields and binds the supplied session", async () => {
  const session = { transactionId: "read-actor-session" };
  const calls = { order: [] };
  const user = createActorUser();
  let lookedUpId;
  const UserModel = {
    findById(id) {
      lookedUpId = id;
      return createUserQuery(user, calls);
    }
  };

  const actor = await loadReadSubmissionActor(AUTHENTICATED_ID, {
    session,
    UserModel
  });

  assert.equal(lookedUpId, AUTHENTICATED_ID);
  assert.equal(calls.selectedFields, READ_ACTOR_FIELDS);
  assert.equal(calls.session, session);
  assert.deepEqual(calls.order, ["select", "session", "lean"]);
  assert.deepEqual(actor, {
    id: AUTHENTICATED_ID,
    role: "team_member",
    active: true,
    teamId: "team-alpha",
    managerId: OTHER_ID,
    employmentStartDate: "2026-01-01",
    employmentEndDate: null
  });
  assert.equal(Object.hasOwn(actor, "password"), false);
});

test("read actor resolver rejects a missing session before model access", async () => {
  let modelCalls = 0;
  await expectAuthError(
    loadReadSubmissionActor(AUTHENTICATED_ID, {
      session: null,
      UserModel: {
        findById() {
          modelCalls += 1;
          assert.fail("User query must not run without a transaction session");
        }
      }
    }),
    503,
    "DATABASE_UNAVAILABLE"
  );
  assert.equal(modelCalls, 0);
});

test("read actor resolver rejects an invalid authenticated ID before model access", async () => {
  let modelCalls = 0;
  await expectAuthError(
    loadReadSubmissionActor("not-an-object-id", {
      session: { transactionId: "valid-session" },
      UserModel: {
        findById() {
          modelCalls += 1;
          assert.fail("User query must not run for an invalid authenticated ID");
        }
      }
    }),
    401,
    "UNAUTHENTICATED"
  );
  assert.equal(modelCalls, 0);
});

test("read actor resolver returns UNAUTHENTICATED when the User does not exist", async () => {
  const session = { transactionId: "missing-user-session" };
  const calls = { order: [] };
  const UserModel = {
    findById(id) {
      assert.equal(id, AUTHENTICATED_ID);
      return createUserQuery(null, calls);
    }
  };

  await expectAuthError(
    loadReadSubmissionActor(AUTHENTICATED_ID, { session, UserModel }),
    401,
    "UNAUTHENTICATED"
  );
  assert.equal(calls.session, session);
  assert.deepEqual(calls.order, ["select", "session", "lean"]);
});

test("read actor resolver rejects a loaded User whose ID differs from the authenticated ID", async () => {
  const session = { transactionId: "mismatched-user-session" };
  const calls = { order: [] };
  const UserModel = {
    findById() {
      return createUserQuery(createActorUser({ _id: OTHER_ID }), calls);
    }
  };

  await expectAuthError(
    loadReadSubmissionActor(AUTHENTICATED_ID, { session, UserModel }),
    401,
    "UNAUTHENTICATED"
  );
  assert.equal(calls.session, session);
});

test("read actor resolver uses the production User model by default", async () => {
  const originalFindById = User.findById;
  const session = { transactionId: "default-user-model-session" };
  const calls = { order: [] };
  let lookedUpId;

  try {
    User.findById = id => {
      lookedUpId = id;
      return createUserQuery(createActorUser(), calls);
    };

    const actor = await loadReadSubmissionActor(AUTHENTICATED_ID, { session });

    assert.equal(actor.id, AUTHENTICATED_ID);
    assert.equal(lookedUpId, AUTHENTICATED_ID);
    assert.equal(calls.selectedFields, READ_ACTOR_FIELDS);
    assert.equal(calls.session, session);
  } finally {
    User.findById = originalFindById;
  }
});

test("read actor resolver can rerun with the same ID and each transaction attempt session", async () => {
  const session1 = { attempt: 1 };
  const session2 = { attempt: 2 };
  const lookups = [];
  const UserModel = {
    findById(id) {
      const calls = { order: [] };
      lookups.push({ id, calls });
      return createUserQuery(createActorUser(), calls);
    }
  };

  // This fake runner models withTransaction invoking its callback again.
  const runRetryableOperation = async operation => {
    const first = await operation(session1);
    const second = await operation(session2);
    return [first, second];
  };
  const actors = await runRetryableOperation(session =>
    loadReadSubmissionActor(AUTHENTICATED_ID, { session, UserModel })
  );

  assert.equal(actors.length, 2);
  assert.equal(actors[0].id, AUTHENTICATED_ID);
  assert.equal(actors[1].id, AUTHENTICATED_ID);
  assert.deepEqual(lookups.map(item => item.id), [AUTHENTICATED_ID, AUTHENTICATED_ID]);
  assert.deepEqual(lookups.map(item => item.calls.session), [session1, session2]);
});

