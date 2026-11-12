import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";

import User from "../src/models/User.js";
import { authMiddleware } from "../src/middleware/auth.js";
import { createDailySubmissionRouter } from "../src/routes/dailySubmissionRoutes.js";
import {
  formatSubmissionError,
  getReportingDateAt,
  validateReportingDateForSubmission,
  validateSubmissionRequest
} from "../src/services/dailySubmissionService.js";
import {
  assertActiveTeamMember,
  assertProjectManagerScope,
  assertTeamLeadScope,
  getAuthenticatedUserId,
  loadSubmissionActor
} from "../src/services/submissionAccessService.js";

const tokenSecret = "offline-daily-submission-test-secret";
const userId = "64b000000000000000000001";
const validMetrics = {
  ticketsAssigned: 4,
  ticketsResolved: 3,
  slaBreaches: 0,
  reopenedTickets: 1,
  clientInteractions: 2,
  remarks: "Routine test"
};
const reportingDate = "2026-11-11";
const testClock = () => new Date("2026-11-11T06:00:00.000Z");

function signedToken(id = userId) {
  return jwt.sign({ id }, tokenSecret);
}
async function withApi({
  ready = true,
  role = "team_member",
  active = true,
  actorLoader,
  userLookup
} = {}, callback) {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;

  process.env.JWT_SECRET = tokenSecret;

  User.findById = userLookup || (() => ({
    select: async () => ({
      _id: userId,
      email: "test@example.invalid",
      role,
      name: "Offline Test"
    })
  }));

  const app = express();
  app.use(express.json());
  app.use("/api/daily-submissions", createDailySubmissionRouter({
    isStoreReady: () => ready,
    clock: testClock,
    actorLoader: actorLoader || (async () => ({
      id: userId,
      role,
      active,
      teamId: "team-1",
      managerId: null
    }))
  }));
  app.use((error, req, res, next) => {
    const result = formatSubmissionError(error);
    res.status(result.status).json(result.body);
  });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await callback("http://127.0.0.1:" + address.port);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    User.findById = originalFindById;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
}

async function request(base, path, { method = "GET", token = signedToken(), body } = {}) {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(base + "/api/daily-submissions" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

test("route foundation registers the required POST and four GET paths", async () => {
  const router = createDailySubmissionRouter({ isStoreReady: () => true });
  const routes = router.stack.filter(layer => layer.route).map(layer => ({
    path: layer.route.path,
    methods: Object.keys(layer.route.methods)
  }));
  assert.deepEqual(routes, [
    { path: "/", methods: ["post"] },
    { path: "/me/history", methods: ["get"] },
    { path: "/me/current", methods: ["get"] },
    { path: "/me/:reportingDate", methods: ["get"] },
    { path: "/:submissionId", methods: ["get"] }
  ]);
});

test("Asia/Kolkata reporting date is independent of host timezone", () => {
  const originalTZ = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(getReportingDateAt(new Date("2026-11-10T19:00:00.000Z")), "2026-11-11");
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
});

test("submission validation accepts only current IST reporting date and allowed metric fields", () => {
  const valid = validateSubmissionRequest({ reportingDate, metrics: validMetrics }, { clock: testClock });
  assert.equal(valid.reportingDate, reportingDate);
  assert.equal(valid.metrics.remarks, "Routine test");
  assert.throws(
    () => validateSubmissionRequest({ reportingDate: "2026-11-10", metrics: validMetrics }, { clock: testClock }),
    error => error.code === "INVALID_REPORTING_DATE"
  );
  assert.throws(
    () => validateSubmissionRequest({ reportingDate: "2026-11-12", metrics: validMetrics }, { clock: testClock }),
    error => error.code === "INVALID_REPORTING_DATE"
  );
  assert.throws(
    () => validateReportingDateForSubmission("2026-02-30", { clock: testClock }),
    error => error.code === "INVALID_REPORTING_DATE"
  );
  assert.throws(
    () => validateSubmissionRequest({ reportingDate, employeeId: userId, metrics: validMetrics }, { clock: testClock }),
    error => error.code === "INVALID_REQUEST"
  );
  assert.throws(
    () => validateSubmissionRequest({ reportingDate, metrics: { ...validMetrics, ticketsResolved: 1.5 } }, { clock: testClock }),
    error => error.code === "INVALID_REQUEST"
  );
});

test("not-ready store returns a standard 503 before authentication or database lookup", async () => {
  await withApi({ ready: false }, async base => {
    const response = await request(base, "/me/current", { token: null });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body.error.code, "SUBMISSION_STORE_UNAVAILABLE");
  });
});

test("missing and invalid JWTs return the standard authentication envelope", async () => {
  await withApi({}, async base => {
    const missing = await request(base, "/me/current", { token: null });
    assert.equal(missing.status, 401);
    assert.equal(missing.body.success, false);
    assert.equal(missing.body.error.code, "UNAUTHENTICATED");

    const invalid = await request(base, "/me/current", { token: "invalid.token" });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error.code, "UNAUTHENTICATED");
  });
});

test("role authorization rejects roles outside the supported submission roles", async () => {
  await withApi({ role: "administrator" }, async base => {
    const response = await request(base, "/me/history");
    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "FORBIDDEN");
  });
});

test("eligible current-date POST validates identity and remains explicitly non-writing", async () => {
  let actorLoads = 0;
  await withApi({ actorLoader: async id => {
    actorLoads += 1;
    assert.equal(id, userId);
    return { id, role: "team_member", active: true, teamId: "team-1", managerId: null };
  } }, async base => {
    const response = await request(base, "/", {
      method: "POST",
      body: { reportingDate, metrics: validMetrics }
    });
    assert.equal(response.status, 501);
    assert.equal(response.body.error.code, "NOT_IMPLEMENTED");
    assert.equal(actorLoads, 1);
  });
});

test("inactive users and client supplied identity fields are rejected before the disabled handler", async () => {
  await withApi({ active: false }, async base => {
    const response = await request(base, "/", {
      method: "POST",
      body: { reportingDate, metrics: validMetrics }
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "ACCOUNT_INACTIVE");
  });

  await withApi({}, async base => {
    const response = await request(base, "/", {
      method: "POST",
      body: { reportingDate, employeeId: "64b000000000000000000002", metrics: validMetrics }
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_REQUEST");
  });
});

test("invalid submission IDs use standard API errors", async () => {
  await withApi({ role: "team_lead" }, async base => {
    const invalidId = await request(base, "/not-an-object-id");
    assert.equal(invalidId.status, 400);
    assert.equal(invalidId.body.error.code, "INVALID_REQUEST");


  });
});

test("actor mapping and scope checks fail closed while allowing assigned Team Leads", async () => {
  const userModel = {
    findById: id => {
      assert.equal(id, userId);
      return { select: () => ({ lean: async () => ({
        _id: userId,
        role: "team_lead",
        active: true,
        teamId: "team-1",
        managerId: "64b000000000000000000009"
      }) }) };
    }
  };
  const actor = await loadSubmissionActor(userId, { UserModel: userModel });
  assert.equal(actor.id, userId);
  assert.equal(actor.active, true);
  assert.equal(actor.managerId, "64b000000000000000000009");
  assert.throws(() => getAuthenticatedUserId({ id: "not-an-id" }), error => error.status === 401);
  assert.throws(() => assertActiveTeamMember({ role: "team_member", active: false }), error => error.status === 403 && error.code === "ACCOUNT_INACTIVE");
  assert.throws(() => assertActiveTeamMember({ role: "team_lead", active: true }), error => error.status === 403 && error.code === "FORBIDDEN");
  assert.equal(assertTeamLeadScope(actor, {
    id: "64b000000000000000000002",
    role: "team_member",
    active: true,
    teamId: "team-1",
    managerId: actor.id
  }), true);
  assert.throws(() => assertTeamLeadScope(actor, {
    id: "64b000000000000000000003",
    role: "team_member",
    active: true,
    teamId: "team-2",
    managerId: actor.id
  }), error => error.status === 403);
  assert.throws(() => assertProjectManagerScope({ role: "project_manager", active: true }), error => error.status === 403);
  assert.equal(assertProjectManagerScope({ role: "project_manager", active: true }, { organizationAuthorized: true }), true);
});


test("expired JWT is rejected with the standard authentication envelope", async () => {
  await withApi({}, async base => {
    const expiredToken = jwt.sign(
      { id: userId },
      tokenSecret,
      { expiresIn: -1 }
    );

    const response = await request(base, "/me/current", {
      token: expiredToken
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "UNAUTHENTICATED");
  });
});

test("valid JWT referencing a missing user returns 401", async () => {
  await withApi({
    userLookup: () => ({
      select: async () => null
    })
  }, async base => {
    const response = await request(base, "/me/current");

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "UNAUTHENTICATED");
  });
});

test("authentication database failure returns a safe 500 response", async () => {
  await withApi({
    userLookup: () => ({
      select: async () => {
        throw new Error("Sensitive database connection details");
      }
    })
  }, async base => {
    const response = await request(base, "/me/current");

    assert.equal(response.status, 500);
    assert.equal(response.body.success, false);
    assert.equal(
      response.body.error.code,
      "AUTHENTICATION_UNAVAILABLE"
    );
    assert.equal(
      JSON.stringify(response.body).includes("Sensitive database"),
      false
    );
  });
});

test("authenticated JWT identity is used for database lookup", async () => {
  const alternateUserId = "64b000000000000000000002";
  let lookedUpId;

  await withApi({
    userLookup: id => {
      lookedUpId = String(id);

      return {
        select: async () => ({
          _id: alternateUserId,
          email: "alternate@example.invalid",
          role: "team_member",
          name: "Alternate Test"
        })
      };
    }
  }, async base => {
    const response = await request(base, "/me/current", {
      token: signedToken(alternateUserId)
    });

    assert.equal(response.status, 501);
    assert.equal(lookedUpId, alternateUserId);
  });
});


test("legacy authentication preserves the existing missing-user response", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;

  process.env.JWT_SECRET = tokenSecret;

  User.findById = () => ({
    select: async () => null
  });

  const app = express();

  // Deliberately do not set standardApiErrors.
  app.get("/legacy", authMiddleware, (req, res) => {
    res.json({ success: true });
  });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

  try {
    const response = await fetch(
      "http://127.0.0.1:" + server.address().port + "/legacy",
      { headers: { authorization: "Bearer " + signedToken() } }
    );

    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, { message: "User not found" });
  } finally {
    await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve())
    );

    User.findById = originalFindById;

    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
});


test("POST rejects Team Leads and Project Managers before actor loading", async () => {
  for (const role of ["team_lead", "project_manager"]) {
    let actorLoads = 0;

    await withApi({
      role,
      actorLoader: async () => {
        actorLoads += 1;
        throw new Error("Actor loader must not execute");
      }
    }, async base => {
      const response = await request(base, "/", {
        method: "POST",
        body: { reportingDate, metrics: validMetrics }
      });

      assert.equal(response.status, 403);
      assert.equal(response.body.success, false);
      assert.equal(response.body.error.code, "FORBIDDEN");
      assert.equal(actorLoads, 0);
    });
  }
});


test("Team Lead scope rejects inactive users and incomplete or mismatched roster assignments", () => {
  const teamLead = {
    id: "64b000000000000000000009",
    role: "team_lead",
    active: true,
    teamId: "team-1"
  };

  const validEmployee = {
    id: "64b000000000000000000002",
    role: "team_member",
    active: true,
    teamId: "team-1",
    managerId: teamLead.id
  };

  // Correct assignment is accepted.
  assert.equal(
    assertTeamLeadScope(teamLead, validEmployee),
    true
  );

  // Inactive Team Lead is rejected.
  assert.throws(
    () => assertTeamLeadScope(
      { ...teamLead, active: false },
      validEmployee
    ),
    error => error.status === 403 && error.code === "FORBIDDEN"
  );

  // Inactive employee is rejected.
  assert.throws(
    () => assertTeamLeadScope(
      teamLead,
      { ...validEmployee, active: false }
    ),
    error => error.status === 403 && error.code === "FORBIDDEN"
  );

  // Different team is rejected.
  assert.throws(
    () => assertTeamLeadScope(
      teamLead,
      { ...validEmployee, teamId: "team-2" }
    ),
    error => error.status === 403 && error.code === "FORBIDDEN"
  );

  // Missing employee team assignment is rejected.
  assert.throws(
    () => assertTeamLeadScope(
      teamLead,
      { ...validEmployee, teamId: null }
    ),
    error => error.status === 403 && error.code === "FORBIDDEN"
  );

  // Missing manager assignment is rejected.
  assert.throws(
    () => assertTeamLeadScope(
      teamLead,
      { ...validEmployee, managerId: null }
    ),
    error => error.status === 403 && error.code === "FORBIDDEN"
  );

  // Another manager's employee is rejected.
  assert.throws(
    () => assertTeamLeadScope(
      teamLead,
      {
        ...validEmployee,
        managerId: "64b000000000000000000008"
      }
    ),
    error => error.status === 403 && error.code === "FORBIDDEN"
  );

  // Missing Team Lead team assignment is rejected.
  assert.throws(
    () => assertTeamLeadScope(
      { ...teamLead, teamId: null },
      validEmployee
    ),
    error => error.status === 403 && error.code === "FORBIDDEN"
  );
});


test("Project Manager scope requires an active authorized Project Manager", () => {
  const projectManager = {
    id: "64b000000000000000000010",
    role: "project_manager",
    active: true
  };

  // Explicit organizational authorization is accepted.
  assert.equal(
    assertProjectManagerScope(projectManager, {
      organizationAuthorized: true
    }),
    true
  );

  // Missing authorization is rejected.
  assert.throws(
    () => assertProjectManagerScope(projectManager),
    error => error.status === 403 && error.code === "FORBIDDEN"
  );

  // Explicitly denied authorization is rejected.
  assert.throws(
    () => assertProjectManagerScope(projectManager, {
      organizationAuthorized: false
    }),
    error => error.status === 403 && error.code === "FORBIDDEN"
  );

  // Inactive Project Manager is rejected.
  assert.throws(
    () => assertProjectManagerScope(
      { ...projectManager, active: false },
      { organizationAuthorized: true }
    ),
    error => error.status === 403 && error.code === "FORBIDDEN"
  );

  // Other roles cannot use Project Manager authorization.
  assert.throws(
    () => assertProjectManagerScope(
      { ...projectManager, role: "team_lead" },
      { organizationAuthorized: true }
    ),
    error => error.status === 403 && error.code === "FORBIDDEN"
  );
});
