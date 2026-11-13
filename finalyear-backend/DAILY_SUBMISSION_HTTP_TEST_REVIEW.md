# Daily Submission HTTP Test Review

**Phase:** 3B.7.8A read-only implementation review  
**Review date:** 2026-11-13  
**Repository:** `D:\Automated Accountability System\finalyear-backend`

## Executive summary

The in-process harness exercises the actual Express application dispatch and daily-submission router, including JSON parsing, readiness, JWT authentication, database-backed role lookup (through a fake), route role gates, controller stubs, and the test error formatter. Each dispatch creates new request and response objects. No record-level authorization is tested by the detail route because the controller remains a 501 stub, and the tests do not claim otherwise.

The implementation is **not ready to close without minor test-harness remediation**. The global-state restoration is protected for failures inside the callback but not failures during harness setup. Also, a test labeled as proving authenticated identity reaches POST actor loading actually rejects the request before actor loading. The response adapter captures status and JSON body for current responses, but does not expose headers or emulate Node response completion state.

No tests were run for this review. No database or external system was accessed. No files other than this requested report were written.

## Findings by severity

### MEDIUM — Global auth state can leak if harness setup throws

**Location:** `test/daily-submissions-api.test.js:49-113`; legacy variant at `:442-473`.

`withApi()` saves and mutates `JWT_SECRET`, `User.findById`, and controller methods at lines 60-82, but enters `try/finally` only at line 106. Assertions and dispatch failures inside the callback restore state correctly. An exception while creating the Express app, installing the router/error middleware, or wrapping a controller occurs before the `try`, leaving the process-wide changes in place. The legacy auth test likewise changes the secret and model method and constructs its app before entering `try` at line 458.

**Remediation:** Move the `try/finally` boundary to begin before the first mutation, and use it to restore every patched value for both harnesses.

### MEDIUM — POST identity test does not exercise actor identity forwarding

**Location:** `test/daily-submissions-api.test.js:582-600`.

The test named “client identity cannot replace the authenticated identity used by POST actor loading” includes an unsupported `employeeId`. Request validation rejects it at line 595 before `actorLoader` runs; lines 597-599 explicitly assert that `loadedId` is undefined. This proves the body field is rejected, but it does not prove which authenticated ID would be passed to actor loading on a valid request.

The successful POST stub case at lines 270-284 does assert that the actor loader receives `userId`, but uses the default token ID. It does not exercise an alternate authenticated ID and separately prove the actor loader receives that ID.

**Remediation:** Keep the rejection case, and add a valid POST case with a non-default authenticated token ID. Assert the fake database lookup and actor loader both receive that authenticated ID, the response remains 501, and the client cannot choose another ID.

### LOW — Response status/body are captured; headers and completion semantics are not

**Location:** `test/daily-submissions-api.test.js:156-180`.

`ServerResponse` preserves Express/Node header methods and `res.status()` sets the captured `statusCode`. Express serializes JSON through its normal `res.json()`/`res.send()` path, and the adapter collects `write()`/`end()` chunks and parses them. This is adequate for the current small JSON responses.

However, the adapter does not return or assert response headers. Its replacement `end()` does not call the original implementation or update `writableEnded`, `finished`, `headersSent`, or end callbacks. The successful route tests resolve when `end()` is called, so body completion for those paths is captured, but the adapter is not a general substitute for response lifecycle behavior. The `app.handle()` completion callback checks `res.writableEnded`, a flag the replacement `end()` never sets; that check is therefore not a reliable completion safeguard for unmatched routes.

**Remediation:** Either document and constrain the adapter to status/body-only JSON route responses, or capture headers and set consistent completion state in the sink. Add tests for the response properties that matter before relying on this adapter for streaming, redirects, cookies, or header-sensitive behavior.

### LOW — Shared-state test serialization is assumed, not enforced

**Location:** `test/daily-submissions-api.test.js:48-52, 70-80, 106-113, 441-473`.

The suite temporarily patches process-wide `JWT_SECRET`, `User.findById`, and methods on the singleton controller object. The current top-level tests do not opt into concurrency, and the comment at line 48 records the serial requirement. If these tests are later marked concurrent or the harness is reused concurrently, overlapping `withApi()` calls can restore each other’s state incorrectly and produce order-dependent results.

**Remediation:** Keep these tests explicitly serial in the test organization and avoid concurrent invocation of `withApi()`. A future dependency-injection seam would remove the shared mutation risk.

## Verified behavior and coverage boundaries

### Express and request/response path

- `dispatchInProcess()` creates a fresh `Readable` request per call, assigns method, URL, headers, stream metadata, and app references, then calls `app.handle(req, res)` (`test/daily-submissions-api.test.js:139-180`). This does not bypass Express path matching or the mounted router.
- `withApi()` installs `express.json()`, mounts `createDailySubmissionRouter()`, and adds a JSON error middleware using `formatSubmissionError()` (`:82-104`). Valid POST tests provide JSON bytes and content headers, so the body parser is in the request path.
- Authentication and readiness are the actual router middleware, not direct calls (`src/routes/dailySubmissionRoutes.js:31-36`). The test checks readiness short-circuiting with zero user lookups (`test/daily-submissions-api.test.js:236-245`).
- The test app is not the complete production server stack. `src/server.js:76-88` configures a 50 MB JSON parser with a `verify` callback and URL-encoded parsing; it also installs CORS/compression and other middleware. The test app uses default `express.json()` and does not exercise those server-level behaviors. This is an acceptable isolation boundary for router authorization, but should not be described as full production-server middleware coverage.
- `src/middleware/errorHandler.js` is empty. The actual global daily-submission error branch is inline in `src/server.js:116-122` and calls the same `formatSubmissionError()` used by the test middleware. The test exercises the formatter/error path, not production server startup or its surrounding middleware.

### Authorization and readiness

- `authMiddleware` verifies the JWT, looks up `decoded.id`, then assigns database `role` over any decoded role (`src/middleware/auth.js:36-80`). The forged-role test uses a JWT claiming Project Manager and a fake database Team Member; the self-service route reaches its stub (`test/daily-submissions-api.test.js:524-531`). That is a valid regression for role authority.
- Active status is not loaded by `authMiddleware` (its projection is `email role name`, `src/middleware/auth.js:51-53`). POST obtains an actor via `actorLoader`, then calls `assertActiveTeamMember()` (`src/routes/dailySubmissionRoutes.js:38-47`). `loadSubmissionActor()` loads `active` from the database (`src/services/submissionAccessService.js:11-30`). The HTTP test proves the route uses the injected fresh actor result and rejects an inactive result despite a JWT `active: true` claim (`test/daily-submissions-api.test.js:533-544`). A separate helper test covers actor mapping (`:317-351`); the injected HTTP test does not independently prove the default loader is used against the actual User model.
- All three `/me/*` routes gate on `team_member` (`src/routes/dailySubmissionRoutes.js:51-64`). Tests cover Team Member reaching each corresponding controller and Team Lead/Project Manager receiving 403 without controller invocation (`test/daily-submissions-api.test.js:501-522`).
- The readiness guard is mounted before authentication (`src/routes/dailySubmissionRoutes.js:35-36`); its test confirms 503 and zero user lookups (`test/daily-submissions-api.test.js:236-245`).
- Valid detail requests for each supported database role reach the stub; invalid IDs return 400 before the controller; an unsupported role is denied (`test/daily-submissions-api.test.js:547-580`). The detail controller is a 501 stub (`src/controllers/dailySubmissionController.js:25-27`), so these tests do not establish record ownership, Team Lead assignment, or Project Manager grant authorization. The review found no claim that they do.

### Disabled POST boundary

The route validates the request, checks the authenticated user ID, loads an actor, and enforces active Team Member status before calling `dailySubmissionController.submit()` (`src/routes/dailySubmissionRoutes.js:38-47`). Every controller method, including `submit`, currently returns `501 NOT_IMPLEMENTED` (`src/controllers/dailySubmissionController.js:1-27`). The valid POST test reaches that stub (`test/daily-submissions-api.test.js:270-284`); inactive, unsupported-role, and invalid-request tests stop before it (`:287-305, :477-499, :564-580`). The current source confirms that no write service is invoked. The test suite counts controller calls rather than spying on a write service, so that “no write-service call” guarantee comes from the inspected stub implementation rather than a direct regression assertion.

## Readiness decision

**Ready after minor remediation; do not close Phase 3B.7.8A until the two MEDIUM findings are addressed.** The current authorization behavior is fail-closed at the tested router boundary, all `/me/*` routes are Team Member-only, and controllers remain disabled. The remaining issues concern test reliability and a misleading identity-coverage claim, not an observed data exposure in the current stubbed endpoints.

## Scope and safety confirmation

Inspected:

- `test/daily-submissions-api.test.js`
- `src/routes/dailySubmissionRoutes.js`
- `src/middleware/auth.js`
- `src/controllers/dailySubmissionController.js`
- `src/middleware/errorHandler.js`
- `src/services/dailySubmissionService.js`
- `src/services/submissionAccessService.js`
- Relevant static portions of `src/server.js`

No tests were run. No server was started. No database, `submission_corrections`, `.env`, email, Google Sheets, scheduler, or other external system was accessed. No implementation or project source file was modified; only this requested Markdown review report was created.
