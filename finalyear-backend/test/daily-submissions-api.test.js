import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { Readable } from "node:stream";
import http from "node:http";

import User from "../src/models/User.js";
import { authMiddleware } from "../src/middleware/auth.js";
import { createDailySubmissionRouter } from "../src/routes/dailySubmissionRoutes.js";
import {
  createDailySubmissionController,
  dailySubmissionController
} from "../src/controllers/dailySubmissionController.js";

import {
  assertActiveTeamMember,
  assertTeamLeadScope,
  getAuthenticatedUserId,
  loadSubmissionActor
} from "../src/services/submissionAccessService.js";
import {
  SubmissionApiError,
  formatSubmissionError,
  getReportingDateAt,
  validateReportingDateForSubmission,
  validateSubmissionRequest
} from "../src/services/dailySubmissionService.js";

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
  userLookup,
  setupFailure,
  controllers = dailySubmissionController
} = {}, callback) {
  // This helper temporarily patches process.env and singleton model/controller methods.
  // Concurrent tests using it are unsupported; keep them serial unless the harness
  // is redesigned around isolated dependency injection.
  const originalSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;
  const controllerMethods = Object.keys(controllers);
  const originalControllers = Object.fromEntries(
    controllerMethods.map(key => [key, controllers[key]])
);
  const calls = {
    userLookups: 0,
    actorLoads: 0,
    readiness: 0,
    controllers: Object.fromEntries(controllerMethods.map(key => [key, 0])),
    controllerRequests: Object.fromEntries(
      controllerMethods.map(key => [key, []])
    )
  };

  try {
    process.env.JWT_SECRET = tokenSecret;

    const lookupUser = userLookup || (() => ({
      select: async () => ({
        _id: userId,
        email: "test@example.invalid",
        role,
        name: "Offline Test"
      })
    }));
    User.findById = (...args) => {
      calls.userLookups += 1;
      return lookupUser(...args);
    };

    for (const key of controllerMethods) {
      controllers[key] = (...args) => {
        calls.controllers[key] += 1;
        calls.controllerRequests[key].push(args[0]);
        return originalControllers[key](...args);
      };
    }

    // Regression seam: simulate a setup exception after all global patches.
    setupFailure?.();

    const app = express();
    app.use(express.json());
    app.use("/api/daily-submissions", createDailySubmissionRouter({
      isStoreReady: () => {
        calls.readiness += 1;
        return ready;
      },
      clock: testClock,
      actorLoader: async (...args) => {
        calls.actorLoads += 1;
        return (actorLoader || (async () => ({
          id: userId,
          role,
          active,
          teamId: "team-1",
          managerId: null
        })))(...args);
      },
      controllers
    }));
    app.use((error, req, res, next) => {
      const result = formatSubmissionError(error);
      res.status(result.status).json(result.body);
    });

    await callback((path, options) => request(app, path, options), calls);
  } finally {
    try {
      User.findById = originalFindById;
    } finally {
      try {
        for (const key of controllerMethods) {
          controllers[key] = originalControllers[key];
      }
      } finally {
        if (originalSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = originalSecret;
      }
    }
  }
}

async function request(app, path, { method = "GET", token = signedToken(), body } = {}) {
  if (typeof app === "function" && typeof app.handle !== "function") {
    return app(path, { method, token, body });
  }
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  let payload;
  if (body !== undefined) {
    payload = Buffer.from(JSON.stringify(body));
    headers["content-type"] = "application/json";
    headers["content-length"] = String(payload.length);
  }
  return dispatchInProcess(app, {
    method,
    url: "/api/daily-submissions" + path,
    headers,
    body: payload
  });
}

// Test-only JSON status/body sink: the Readable request goes through Express's
// app.handle(), but this is not a complete Node ServerResponse implementation.
// Do not use it for streaming, redirects, cookies, header-sensitive behavior,
// or full Node response-lifecycle assertions. No socket/listener/fetch is used.
function dispatchInProcess(app, { method = "GET", url = "/", headers = {}, body } = {}) {
  const req = Readable.from(body ? [body] : []);
  Object.setPrototypeOf(req, express.request);
  req.method = method;
  req.url = url;
  req.originalUrl = url;
  req.baseUrl = "";
  req.headers = headers;
  req.httpVersion = "1.1";
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  req.complete = true;
  req.connection = {};
  req.socket = {};
  req.app = app;
  req.res = undefined;

  const res = new http.ServerResponse(req);
  Object.setPrototypeOf(res, express.response);
  res.app = app;
  res.req = req;
  req.res = res;

  return new Promise((resolve, reject) => {
    const chunks = [];
    res.write = chunk => {
      if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return true;
    };
    res.end = chunk => {
      if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      const text = Buffer.concat(chunks).toString("utf8");
      let parsed;
      try { parsed = text ? JSON.parse(text) : undefined; }
      catch { return reject(new Error("Express response was not valid JSON: " + text)); }
      resolve({ status: res.statusCode, body: parsed });
      return res;
    };
    app.handle(req, res, error => {
      if (error) reject(error);
      else if (!res.writableEnded) reject(new Error("Express completed without ending the response"));
    });
  });
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

test("withApi restores all patched global state when setup throws", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;
  const originalControllers = Object.fromEntries(
    Object.keys(dailySubmissionController).map(key => [key, dailySubmissionController[key]])
  );

  await assert.rejects(
    () => withApi({
      setupFailure() {
        throw new Error("Synthetic setup failure after global patches");
      }
    }, async () => assert.fail("callback must not run after setup failure")),
    /Synthetic setup failure after global patches/
  );

  assert.equal(process.env.JWT_SECRET, originalSecret);
  assert.equal(User.findById, originalFindById);
  for (const [key, method] of Object.entries(originalControllers)) {
    assert.equal(dailySubmissionController[key], method);
  }
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
  await withApi({ ready: false }, async (base, calls) => {
    const response = await request(base, "/me/current", { token: null });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body.error.code, "SUBMISSION_STORE_UNAVAILABLE");
    assert.equal(calls.readiness, 1);
    assert.equal(calls.userLookups, 0);
    assert.equal(calls.controllers.getCurrent, 0);
  });
});

test("missing and invalid JWTs return the standard authentication envelope", async () => {
  await withApi({}, async (base, calls) => {
    const missing = await request(base, "/me/current", { token: null });
    assert.equal(missing.status, 401);
    assert.equal(missing.body.success, false);
    assert.equal(missing.body.error.code, "UNAUTHENTICATED");

    const invalid = await request(base, "/me/current", { token: "invalid.token" });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error.code, "UNAUTHENTICATED");
    assert.equal(calls.userLookups, 0);
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
  }, async (base, calls) => {
    const response = await request(base, "/me/current");

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, "UNAUTHENTICATED");
    assert.equal(calls.userLookups, 1);
  });
});

test("authentication database failure returns a safe 500 response", async () => {
  await withApi({
    userLookup: () => ({
      select: async () => {
        throw new Error("Sensitive database connection details");
      }
    })
  }, async (base, calls) => {
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
    assert.equal(calls.userLookups, 1);
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
  }, async (base, calls) => {
    const response = await request(base, "/me/current", {
      token: signedToken(alternateUserId)
    });

    assert.equal(response.status, 501);
    assert.equal(lookedUpId, alternateUserId);
    assert.equal(calls.userLookups, 1);
    assert.equal(calls.controllers.getCurrent, 1);
  });
});


test("legacy authentication preserves the existing missing-user response", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;

  // This legacy harness patches process-wide state too; it must remain serial.
  try {
    process.env.JWT_SECRET = tokenSecret;
    User.findById = () => ({
      select: async () => null
    });

    const app = express();
    // Deliberately do not set standardApiErrors.
    app.get("/legacy", authMiddleware, (req, res) => {
      res.json({ success: true });
    });

    const response = await dispatchInProcess(app, {
      url: "/legacy",
      headers: { authorization: "Bearer " + signedToken() }
    });
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { message: "User not found" });
  } finally {
    try {
      User.findById = originalFindById;
    } finally {
      if (originalSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = originalSecret;
      }
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

test("database role controls each self-service route and rejected roles never reach controllers", async () => {
  const selfRoutes = [
    ["/me/history?fromDate=2026-11-01&toDate=2026-11-11", "getHistory"],
    ["/me/current", "getCurrent"],
    ["/me/" + reportingDate, "getOwnDay"]
  ];
  for (const [path, controller] of selfRoutes) {
    await withApi({ role: "team_member" }, async (send, calls) => {
      const response = await send(path);
      assert.equal(response.status, 501, path + " should reach its disabled controller");
      assert.equal(calls.controllers[controller], 1);
    });
    for (const role of ["team_lead", "project_manager"]) {
      await withApi({ role }, async (send, calls) => {
        const response = await send(path);
        assert.equal(response.status, 403, role + " must be denied at " + path);
        assert.equal(response.body.error.code, "FORBIDDEN");
        assert.equal(calls.controllers[controller], 0);
      });
    }
  }
});

test("database role overrides forged JWT role and active claims", async () => {
  const forgedRoleToken = jwt.sign({ id: userId, role: "project_manager", active: false }, tokenSecret);
  await withApi({ role: "team_member", active: true }, async (send, calls) => {
    const response = await send("/me/current", { token: forgedRoleToken });
    assert.equal(response.status, 501);
    assert.equal(calls.userLookups, 1);
    assert.equal(calls.controllers.getCurrent, 1);
  });

  const forgedActiveToken = jwt.sign({ id: userId, role: "team_member", active: true }, tokenSecret);
  await withApi({ role: "team_member", active: false }, async (send, calls) => {
    const response = await send("/", {
      method: "POST",
      token: forgedActiveToken,
      body: { reportingDate, metrics: validMetrics }
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "ACCOUNT_INACTIVE");
    assert.equal(calls.actorLoads, 1);
    assert.equal(calls.controllers.submit, 0);
  });
});

test("supported roles reach only the disabled detail stub and unsupported roles are denied", async () => {
  const validId = "64b000000000000000000099";
  for (const role of ["team_member", "team_lead", "project_manager"]) {
    await withApi({ role }, async (send, calls) => {
      const response = await send("/" + validId);
      assert.equal(response.status, 501);
      assert.equal(calls.controllers.getDetail, 1);
    });
  }
  await withApi({ role: "administrator" }, async (send, calls) => {
    const response = await send("/" + validId);
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
    assert.equal(calls.controllers.getDetail, 0);
  });
});

test("invalid detail identifiers stop before controller and POST payload validation remains active", async () => {
  await withApi({ role: "team_member" }, async (send, calls) => {
    const detail = await send("/not-an-object-id");
    assert.equal(detail.status, 400);
    assert.equal(detail.body.error.code, "INVALID_REQUEST");
    assert.equal(calls.controllers.getDetail, 0);

    const invalidPost = await send("/", {
      method: "POST",
      body: { reportingDate: "2026-11-10", metrics: validMetrics }
    });
    assert.equal(invalidPost.status, 400);
    assert.equal(invalidPost.body.error.code, "INVALID_REPORTING_DATE");
    assert.equal(calls.actorLoads, 0);
    assert.equal(calls.controllers.submit, 0);
  });
});

test("client identity cannot replace the authenticated identity used by POST actor loading", async () => {
  const authenticatedId = "64b000000000000000000002";
  const otherId = "64b000000000000000000003";
  let loadedId;
  await withApi({ actorLoader: async id => {
    loadedId = id;
    return { id, role: "team_member", active: true, teamId: "team-1", managerId: null };
  } }, async (send, calls) => {
    const response = await send("/", {
      method: "POST",
      token: signedToken(authenticatedId),
      body: { reportingDate, metrics: validMetrics, employeeId: otherId }
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_REQUEST");
    assert.equal(loadedId, undefined);
    assert.equal(calls.actorLoads, 0);
    assert.equal(calls.controllers.submit, 0);
  });
});

test("valid POST forwards the authenticated identity, never a client query identity", async () => {
  const authenticatedId = "64b000000000000000000004";
  const clientChosenId = "64b000000000000000000005";
  let databaseLookupId;
  let actorArguments;

  await withApi({
    userLookup: id => {
      databaseLookupId = String(id);
      return {
        select: async () => ({
          _id: authenticatedId,
          email: "synthetic@example.invalid",
          role: "team_member",
          name: "Synthetic Member"
        })
      };
    },
    actorLoader: async (...args) => {
      actorArguments = args;
      return {
        id: authenticatedId,
        role: "team_member",
        active: true,
        teamId: "synthetic-team",
        managerId: null
      };
    }
  }, async (send, calls) => {
    const response = await send("/?employeeId=" + clientChosenId, {
      method: "POST",
      token: signedToken(authenticatedId),
      body: { reportingDate, metrics: validMetrics }
    });

    assert.equal(databaseLookupId, authenticatedId);
    assert.deepEqual(actorArguments, [authenticatedId]);
    assert.equal(actorArguments.includes(clientChosenId), false);
    assert.equal(calls.userLookups, 1);
    assert.equal(calls.actorLoads, 1);
    assert.equal(calls.controllers.submit, 1);
    assert.equal(response.status, 501);
    assert.equal(response.body.error.code, "NOT_IMPLEMENTED");
  });
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

// --------------------------------------------------
// READ REQUEST HTTP VALIDATION
// --------------------------------------------------

test("self-service current endpoint rejects unsupported query parameters", async () => {
  await withApi({ role: "team_member" }, async (send, calls) => {
    const response = await send(
      "/me/current?employeeId=64b000000000000000000002"
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.equal(calls.controllers.getCurrent, 0);
  });
});

test("self-service reporting date endpoint validates date and query parameters", async () => {
  await withApi({ role: "team_member" }, async (send, calls) => {
    const invalidDate = await send("/me/2026-02-30");

    assert.equal(invalidDate.status, 400);
    assert.equal(
      invalidDate.body.error.code,
      "INVALID_REPORTING_DATE"
    );

    const unsupportedQuery = await send(
      "/me/2026-11-11?employeeId=64b000000000000000000002"
    );

    assert.equal(unsupportedQuery.status, 400);
    assert.equal(
      unsupportedQuery.body.error.code,
      "VALIDATION_ERROR"
    );

    assert.equal(calls.controllers.getOwnDay, 0);
  });
});

test("self-service history endpoint rejects invalid ranges and pagination", async () => {
  await withApi({ role: "team_member" }, async (send, calls) => {
    const requests = [
      [
        "/me/history",
        "INVALID_REPORTING_DATE"
      ],
      [
        "/me/history?fromDate=2026-11-12&toDate=2026-11-01",
        "VALIDATION_ERROR"
      ],
      [
        "/me/history?fromDate=2026-11-01&toDate=2026-11-11&limit=101",
        "VALIDATION_ERROR"
      ],
      [
        "/me/history?fromDate=2026-11-01&toDate=2026-11-11&page=1&page=2",
        "VALIDATION_ERROR"
      ],
      [
        "/me/history?fromDate=2026-11-01&toDate=2026-11-11&employeeId=64b000000000000000000002",
        "VALIDATION_ERROR"
      ]
    ];

    for (const [path, expectedCode] of requests) {
      const response = await send(path);

      assert.equal(response.status, 400, path);
      assert.equal(response.body.error.code, expectedCode, path);
    }

    assert.equal(calls.controllers.getHistory, 0);
  });
});

test("valid self-service read requests preserve validated values at the controller boundary", async () => {
  await withApi({ role: "team_member" }, async (send, calls) => {
    const requests = [
      {
        path: "/me/current",
        controller: "getCurrent",
        verify(req) {
          assert.deepEqual(req.validatedReadQuery, {});
        }
      },
      {
        path: "/me/" + reportingDate,
        controller: "getOwnDay",
        verify(req) {
          assert.equal(req.validatedReportingDate, reportingDate);
          assert.deepEqual(req.validatedReadQuery, {});
        }
      },
      {
        path: "/me/history?fromDate=2026-11-01&toDate=2026-11-11&page=2&limit=50",
        controller: "getHistory",
        verify(req) {
          assert.deepEqual(req.validatedReadQuery, {
            fromDate: "2026-11-01",
            toDate: "2026-11-11",
            page: 2,
            limit: 50
          });
        }
      }
    ];

    for (const { path, controller, verify } of requests) {
      const response = await send(path);

      assert.equal(response.status, 501, path);
      assert.equal(response.body.error.code, "NOT_IMPLEMENTED");
      assert.equal(calls.controllers[controller], 1);
      assert.equal(calls.controllerRequests[controller].length, 1);

      const capturedRequest = calls.controllerRequests[controller][0];

      assert.ok(capturedRequest);
      verify(capturedRequest);
    }
  });
});
// --------------------------------------------------
// INJECTED SELF-SERVICE READ CONTROLLER HTTP TESTS
// --------------------------------------------------

test("injected reporting-day controller forwards authenticated identity and validated date", async () => {
  let serviceArguments;

  const controllers = createDailySubmissionController({
    readService: {
      async getOwnDay(args) {
        serviceArguments = args;
        return {
          reportingDate,
          status: "Pending"
        };
      },
      async getOwnCurrent() {},
      async getOwnHistory() {}
    },
    clock: testClock,
    enableSelfServiceReads: true
  });

  await withApi({ controllers }, async send => {
    const response = await send("/me/" + reportingDate);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true,
      data: {
        reportingDate,
        status: "Pending"
      }
    });

    assert.equal(serviceArguments.authenticatedUserId, userId);
    assert.equal(serviceArguments.reportingDate, reportingDate);
    assert.equal(serviceArguments.clock, testClock);
  });
});

test("injected current-day controller returns the read-service result", async () => {
  let serviceArguments;

  const controllers = createDailySubmissionController({
    readService: {
      async getOwnDay() {},
      async getOwnCurrent(args) {
        serviceArguments = args;
        return {
          reportingDate,
          status: "On-Time",
          metrics: validMetrics
        };
      },
      async getOwnHistory() {}
    },
    clock: testClock,
    enableSelfServiceReads: true
  });

  await withApi({ controllers }, async send => {
    const response = await send("/me/current");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true,
      data: {
        reportingDate,
        status: "On-Time",
        metrics: validMetrics
      }
    });

    assert.equal(serviceArguments.authenticatedUserId, userId);
    assert.equal(serviceArguments.clock, testClock);
  });
});

test("injected history controller forwards validated pagination and preserves empty results", async () => {
  let serviceArguments;

  const emptyHistory = {
    items: [],
    pagination: {
      page: 2,
      limit: 50,
      totalRecords: 0,
      totalPages: 0
    }
  };

  const controllers = createDailySubmissionController({
    readService: {
      async getOwnDay() {},
      async getOwnCurrent() {},
      async getOwnHistory(args) {
        serviceArguments = args;
        return emptyHistory;
      }
    },
    clock: testClock,
    enableSelfServiceReads: true
  });

  await withApi({ controllers }, async send => {
    const response = await send(
      "/me/history?fromDate=2026-11-01&toDate=2026-11-11&page=2&limit=50"
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true,
      data: emptyHistory
    });

    assert.equal(serviceArguments.authenticatedUserId, userId);
    assert.equal(serviceArguments.fromDate, "2026-11-01");
    assert.equal(serviceArguments.toDate, "2026-11-11");
    assert.equal(serviceArguments.page, 2);
    assert.equal(serviceArguments.limit, 50);
    assert.equal(serviceArguments.clock, testClock);
  });
});

test("injected read-service rejection reaches standard API error middleware", async () => {
  const controllers = createDailySubmissionController({
    readService: {
      async getOwnDay() {},
      async getOwnCurrent() {
        throw new SubmissionApiError(
          503,
          "SUBMISSION_OUTCOME_UNCONFIRMED",
          "Synthetic read failure"
      );
      },
      async getOwnHistory() {}
    },
    clock: testClock,
    enableSelfServiceReads: true
  });

  await withApi({ controllers }, async send => {
    const response = await send("/me/current");

    assert.equal(response.status, 503);
    assert.equal(response.body.success, false);
    assert.equal(
      response.body.error.code,
      "SUBMISSION_OUTCOME_UNCONFIRMED"
    );
    assert.equal(
      JSON.stringify(response.body).includes("Synthetic read failure"),
      false
    );
  });
});

test("self-service controller factory remains disabled unless explicitly enabled", () => {
  const disabledController = createDailySubmissionController();

  const response = {
    statusCode: null,
    body: null,
    status(status) {
      this.statusCode = status;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  disabledController.getCurrent({}, response);

  assert.equal(response.statusCode, 501);
  assert.equal(response.body.error.code, "NOT_IMPLEMENTED");
});
test("production-style injected composition keeps all five operations disabled", async () => {
  const calls = {
    getOwnDay: 0,
    getOwnCurrent: 0,
    getOwnHistory: 0
  };
  const readService = {
    getOwnDay() {
      calls.getOwnDay += 1;
      throw new Error("Disabled read service must not execute");
    },
    getOwnCurrent() {
      calls.getOwnCurrent += 1;
      throw new Error("Disabled read service must not execute");
    },
    getOwnHistory() {
      calls.getOwnHistory += 1;
      throw new Error("Disabled read service must not execute");
    }
  };
  const controllers = createDailySubmissionController({
    readService,
    enableSelfServiceReads: false
  });

  await withApi({ controllers }, async send => {
    const requests = [
      ["GET", "/me/current"],
      ["GET", "/me/2026-11-11"],
      ["GET", "/me/history?fromDate=2026-11-10&toDate=2026-11-11"],
      ["POST", "/", { reportingDate, metrics: validMetrics }],
      ["GET", "/64b000000000000000000001"]
    ];

    for (const [method, path, body] of requests) {
      const response = await send(path, { method, body });
      assert.equal(response.status, 501, method + " " + path);
      assert.equal(response.body.success, false);
      assert.equal(response.body.error.code, "NOT_IMPLEMENTED");
    }
  });

  assert.deepEqual(calls, {
    getOwnDay: 0,
    getOwnCurrent: 0,
    getOwnHistory: 0
  });
});
test("ready daily-submission readiness allows request to reach disabled controller", async () => {
  await withApi({ ready: true }, async (send, calls) => {
    const response = await send("/me/current");

    assert.equal(response.status, 501);
    assert.equal(response.body.error.code, "NOT_IMPLEMENTED");
    assert.equal(calls.readiness, 1);
    assert.equal(calls.userLookups, 1);
    assert.equal(calls.controllers.getCurrent, 1);
  });
});
