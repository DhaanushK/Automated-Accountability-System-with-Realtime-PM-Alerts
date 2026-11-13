# Daily Submission HTTP Authorization Test Plan

**Phase:** 3B.7.8 — HTTP Authorization Boundary Test Preparation  
**Review type:** Static inspection and test planning only  
**Project:** Automated Accountability System with Real-Time PM Alerts

## 1. Existing test-harness architecture

`test/daily-submissions-api.test.js` builds a small Express app locally. Its `withApi()` helper:

1. Replaces `User.findById` with a fake query result and sets a temporary test `JWT_SECRET`.
2. Mounts `createDailySubmissionRouter()` under `/api/daily-submissions` with injected `isStoreReady`, fixed clock, and `actorLoader` values.
3. Adds a test error handler using `formatSubmissionError()`.
4. Starts a real `http.createServer(app)` listener on `127.0.0.1` and an ephemeral port.
5. Uses `fetch()` to send requests, then closes the listener and restores the patched model method and environment value in `finally`.

The suite does not import `src/server.js`. It tests the route module directly and replaces the authentication model lookup, so the API tests do not need a MongoDB connection. The `actorLoader` and store readiness check are already injectable through the router factory. The test file also has direct unit checks for request validation, `loadSubmissionActor()`, role helpers, and route registration.

No reusable in-process HTTP request utility was found in the inspected test files. `supertest`, `light-my-request`, and `@hapi/shot` are not installed. The installed Express version is 4.22.1; `package.json` declares `^4.18.3`.

## 2. Previous EACCES failure

The earlier run’s 12 failures were caused at the test transport layer. The test created an ephemeral TCP listener, then `fetch()` attempted to connect to `127.0.0.1:<ephemeral-port>`. The sandbox rejected those local socket connections with `EACCES`. The five tests that did not need to fetch over that socket passed. The failures did not indicate a MongoDB failure or a failed application assertion.

The tests require a real TCP listener only because `withApi()` uses `http.createServer()`, `server.listen()`, and `fetch()`. A safer test transport does not require changing network configuration or using the production server.

## 3. Recommended isolated HTTP testing approach

Replace the test-only transport with an in-process Express router harness in `test/daily-submissions-api.test.js`:

- Build the same Express app and mount the same `createDailySubmissionRouter()` instance.
- Create request objects with the relevant method, URL, headers, body, and query values; call `app.handle()` or the mounted router’s `handle()` directly, without `listen()`, `http.createServer()`, or `fetch()`.
- Use a small in-memory response adapter that captures status and JSON. Capture errors passed to the app/router completion callback and apply the same `formatSubmissionError()` behavior as the current test error middleware.
- Continue injecting `isStoreReady`, clock, and actor loader. Continue replacing `User.findById` with a fake query in a `try/finally`, or add a narrowly scoped auth user-model injection in a later implementation if dependency injection is preferred. The fake database user’s role must remain authoritative over any role in the signed test token.
- Keep all request and response fixtures local to the test. Do not import the production server or open sockets.

This approach exercises Express path matching and middleware order without a listener. A direct call to individual middleware/controller functions can supplement it, but should not be presented as full route-pipeline coverage.

Readiness can already be tested without MongoDB: `createDailySubmissionRouter({ isStoreReady: () => false })` causes the guard to return its standard 503 response before authentication. Assert that the fake User lookup was not called.

### Test setup isolation

`withApi()` temporarily mutates `process.env.JWT_SECRET` and `User.findById`. Preserve its restoration in `finally`, and do not mark those tests concurrent while the shared global state is patched. Use a fake actor loader for active-account and roster scenarios. The read services themselves accept injected model/query dependencies through the `models` argument; that provides a fully offline way to verify service-level assignment and grant checks.

## 4. Route-by-route authorization matrix

Router mount: `/api/daily-submissions`.

| Route | Current route gate | Current controller result with valid prerequisites | Planned role/assertion boundary |
|---|---|---|---|
| `GET /me/history` | Allows Team Member, Team Lead, Project Manager | `501 NOT_IMPLEMENTED` | Team Member only. Once enabled, map the authenticated actor ID to `getOwnHistory`; no client employee ID. |
| `GET /me/current` | Allows all three supported roles | `501 NOT_IMPLEMENTED` | Team Member only. Once enabled, map the authenticated actor to `getOwnCurrent`; service now enforces Team Member role. |
| `GET /me/:reportingDate` | Allows all three supported roles | Valid route reaches `501 NOT_IMPLEMENTED`; invalid dates are not validated by this route before the stub | Team Member only. Once enabled, validate date and call `getOwnDay` using authenticated identity. |
| `GET /:submissionId` | Allows all three supported roles; validates the ID before controller | Valid ObjectId reaches `501 NOT_IMPLEMENTED`; invalid ID returns standard 400 `INVALID_REQUEST` | All supported roles may reach the read service, which must authorize the actual record by owner, historical Team Lead assignment, or active Project Manager grant. |
| `POST /` | Team Member only; validates request and loads fresh actor before controller | Eligible active Team Member reaches `501 NOT_IMPLEMENTED` | Keep disabled. Invalid payload/date, unsupported role, or inactive account can fail before the stub as currently implemented. |

**Important current gap:** the three `/me/*` route declarations use `authorizeRoles(...SUPPORTED_ROLES)`. That lets Team Leads and Project Managers pass the route gate and receive the 501 stub. It does not expose submission data today, but it does not meet the intended Team Member-only self-service role policy. Do not encode Team Lead/Project Manager access as acceptable `/me/*` behavior in the prepared regression suite. Route role restrictions should be corrected before any read controller is enabled.

The four employee/organization service operations (`getEmployeeDay`, `getEmployeeHistory`, `getOrganizationDay`, `getOrganizationHistory`) currently have no HTTP routes. This plan does not propose adding or enabling those routes in this phase.

## 5. Middleware and service boundary test matrix

| Scenario | Boundary | Planned assertion |
|---|---|---|
| Missing token | Authentication middleware | 401 `UNAUTHENTICATED`; no user lookup. |
| Invalid/expired token | JWT verification | 401 `UNAUTHENTICATED`; no user lookup. |
| Valid Team Member JWT | Auth + route | Database fake supplies Team Member role; `/me/*` reaches current 501 stub after route restriction is in place. |
| Valid Team Lead JWT | Auth + route | Database role is Team Lead even if token claims another role; `/me/*` is denied 403; valid-ID detail reaches current 501 stub only while service remains unwired. Service-level assignment checks remain separate. |
| Valid Project Manager JWT | Auth + route | Database role is Project Manager even if token claims another role; `/me/*` is denied 403; valid-ID detail reaches current 501 stub only while service remains unwired. Service-level grant checks remain separate. |
| Unsupported database role | Role middleware | 403 `FORBIDDEN`; controller not called. |
| Inactive Team Member POST | Fresh actor loader | 403 `ACCOUNT_INACTIVE`; controller remains uncalled. |
| Inactive Team Lead/Project Manager for future GET wiring | Fresh actor lookup/service boundary | Pass a server-loaded actor with `active: false`; expect 403 before any read-service model query. Current GET stubs do not load an actor, so do not claim this is covered at HTTP level today. |
| Invalid submission ID | Detail route parameter validation | 400 `INVALID_REQUEST`; detail controller not called. |
| Invalid reporting date | Service/endpoint validation | Direct service already validates dates. Current GET stub does not validate this route parameter, so current endpoint behavior is 501 after auth/role checks; add 400 HTTP assertion only when validation is connected. |
| Invalid history date/page/limit | Service/endpoint validation | Service tests cover invalid date range and page zero. Current history controller ignores query values and returns 501; later controller tests should verify 400 before service database reads. |
| Store unavailable | Readiness middleware | 503 `SUBMISSION_STORE_UNAVAILABLE` before authentication and with zero user lookups. |
| All four GET stubs | Route/controller | With store ready, valid token, accepted role, and valid detail ID, assert 501 `NOT_IMPLEMENTED`. For `/me/*`, use Team Member as the accepted role after correcting route gates. |
| POST remains disabled | Route/controller | Valid active Team Member request returns 501 `NOT_IMPLEMENTED`; no write service call. Existing invalid/inactive/role checks remain pre-stub outcomes. |
| Authenticated identity vs client identity | Route/service mapping | A request body/query employee ID cannot select another identity. `/me/*` must pass the ID from the authenticated actor only; POST already rejects `employeeId` as an unsupported field. |
| Team Lead assignment and overlap | Read-service boundary | Use injected assignment model and fake session; test assigned, unassigned, inclusive boundaries, other lead, and overlap. Route role approval alone must never be treated as authorization. |
| Project Manager grant and revocation | Read-service boundary | Use injected grant model; active ORGANIZATION grant permits; absent/inactive/revoked grant and inactive actor deny. Route role approval alone must never be treated as authorization. |

The current 501 stubs mean endpoint-level service authorization is not currently possible. The HTTP tests should prove middleware ordering and disabled responses; service tests should continue to prove assignment/grant and record-level authorization until a separately approved endpoint-wiring phase.

## 6. Required fixtures and dependency injection

Use only synthetic in-memory values:

- A fixed JWT secret for the test and signed tokens containing only identity claims; add forged `role`/`active` claims in selected tests to prove those values do not override fresh database-backed role state.
- A fake `User.findById()` query result for email, role, and name; add rejected/missing-user variants. The query fake must behave like the middleware’s awaited `.select()` call.
- A fake actor loader returning fresh `id`, `role`, `active`, and roster attributes for POST and future GET controllers.
- `isStoreReady` closures returning true/false, with a lookup counter to prove readiness short-circuits auth.
- A fixed clock and valid/invalid reporting dates.
- For service-boundary cases, fake `ExpectedSubmission`, `MetricSubmission`, `EmployeeReportingAssignment`, and `SubmissionAccessGrant` query objects with session-aware chain methods; no fixture insertion or MongoDB setup.
- Response captures for status, JSON body, controller invocation count, actor loader invocation count, user lookup count, and service/model query count.

Do not use a real User model query, `mongoose.connect()`, a production database, or actual grants/accounts.

## 7. Files for a subsequent implementation phase

Test-harness work can be limited to `test/daily-submissions-api.test.js` if it continues to mock `User.findById` and inject router options.

If the later approved phase wires read operations, likely production touchpoints are:

- `src/routes/dailySubmissionRoutes.js` — narrow `/me/*` role gates and pass validated parameters.
- `src/controllers/dailySubmissionController.js` — map authenticated/fresh actor identity to read-service calls; keep error behavior safe.
- `src/middleware/auth.js` or router construction — only if adding a scoped user-model/verifier injection seam is approved. The existing test can currently patch `User.findById` without this change.
- `src/services/submissionAccessService.js` — existing `loadSubmissionActor()` already loads fresh role/active/roster data; reuse it rather than trusting token role/active claims.
- `test/daily-submissions-api.test.js` — in-process request harness and endpoint-level cases.
- Existing read-service tests remain the place for authorization rules that are not yet exposed over HTTP.

No files in this list should be changed as part of this planning phase.

## 8. Safety risks and mitigations

| Risk | Mitigation |
|---|---|
| Local listener/fetch is blocked by sandbox policy | Use direct in-process Express router/app dispatch and in-memory request/response adapters. Do not request broader network permissions. |
| Accidentally importing `src/server.js` | Import only the router, controller, middleware, and service modules under test. `server.js` runs `connectDB()`, initializes the alert scheduler, loads `.env`, imports legacy routes, and starts a listener. |
| Test invokes MongoDB through real auth model | Replace `User.findById()` with a scoped fake or use a later approved dependency injection seam; verify lookup counts and restore the original in `finally`. |
| Shared process state leaks between tests | Restore `JWT_SECRET` and model patches in `finally`; do not run state-mutating tests concurrently. |
| Route role allowlist is mistaken for record authorization | Keep separate middleware and service-boundary tests. Team Lead assignment and Project Manager grant checks must be exercised at the service boundary. |
| Disabled controller is accidentally replaced/wired | Assert controller responses remain 501 and inject spy services only in later approved work. |
| Express 4 drops a rejected async controller promise | Current GET controllers are synchronous stubs. Any future async controller must be wrapped by the route’s `asyncRoute()` helper or explicitly forward rejection to `next(error)`. |

## 9. Recommended implementation sequence

1. Keep all endpoints disabled and change only the test harness transport in a later authorized phase; prove one representative auth/readiness/stub case can be dispatched without TCP.
2. Expand the harness to cover missing/invalid token, user lookup failure, database-authoritative roles, and store-readiness short-circuiting.
3. Add valid Team Member, Team Lead, and Project Manager route cases for every current GET path, distinguishing the 501 stub response from service authorization.
4. Correct `/me/*` route role restrictions before enabling any self-service read controller; add explicit 403 tests for Team Lead and Project Manager there.
5. Add invalid detail ID route tests and service/endpoint date and history-query validation tests when those validations are connected. Do not change current 501 stubs merely to make invalid-query requests return 400.
6. Add active actor and authenticated-identity mapping assertions; use `loadSubmissionActor()` for fresh active state when a read controller is eventually wired.
7. Keep Team Lead assignment, Project Manager grant/revocation, cross-employee, and record-integrity cases in the offline service suites. Add HTTP-to-service mapping tests only after controller wiring is separately authorized.
8. Run only the explicitly named API and relevant read-service unit files. Never use broad discovery or production startup.

## Review boundary confirmation

This document records static inspection and planning only. No tests were executed, no server was started, no database or external integration was accessed, no production code or package files were modified, and no `submission_corrections` schema or collection was inspected. All daily-submission GET and POST controllers remain `501 NOT_IMPLEMENTED`.
