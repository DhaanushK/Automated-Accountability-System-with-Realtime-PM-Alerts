# Daily Submission Read Service Review

**Review type:** Read-only security and implementation audit  
**Project:** Automated Accountability System with Real-Time PM Alerts  
**Scope:** Daily submission read services, authorization helpers, read transactions, models, routes, controllers, middleware, and named offline tests.

## A. Executive summary

The read services have a sound transaction foundation: operations run under a primary, snapshot transaction; service queries use one session; history counts use the same filter and session as the corresponding page query; and Team Lead history restricts dates before pagination and counting. Role-specific access helpers also fail closed for assignment conflicts and absent Project Manager grants.

The implementation is **not ready for endpoint enablement or controlled integration-test execution**. Two “own” operations (`getOwnDay` and `getOwnCurrent`) do not explicitly restrict callers to Team Members. Submitted-record reads also do not verify that `actualSubmittedAt` is a valid instant, that `statusEvaluatedAt` matches it, or that `status` agrees with the timestamp and deadline. Finally, every HTTP GET handler is still a 501 stub, so service-level tests do not establish endpoint-level authorization. The authentication middleware does not populate `active`; any future read controller must use the fresh actor loader or equivalent rather than pass `req.user` directly to Team Lead or Project Manager services.

The implementation should remain disabled until the data-integrity checks and role-to-endpoint mapping are resolved and tested at the HTTP boundary.

## B. Authorization matrix

| Read operation | Team Member | Team Lead | Project Manager | HTTP status today |
|---|---|---|---|---|
| `getOwnDay` | Uses `actor.id` as employee ID and validates self identity. | No explicit role rejection; flows through assignment authorization for the caller’s own ID. | No explicit role rejection; flows through persisted organization grant authorization for the caller’s own ID. | Not wired; matching GET controller returns 501. |
| `getOwnCurrent` | Derives the current reporting date, then follows `getOwnDay` authorization. | Same missing explicit role guard as `getOwnDay`. | Same missing explicit role guard as `getOwnDay`. | Not wired; matching GET controller returns 501. |
| `getOwnHistory` | Explicitly requires `team_member`; employee ID comes from actor. | Rejected 403. | Rejected 403. | Not wired; matching GET controller returns 501. |
| `getEmployeeDay` | Allowed only when requested employee ID equals actor ID. | Requires one matching historical assignment on that date. | Requires active Project Manager and persisted active ORGANIZATION grant. | No employee-day HTTP route; service is not called. |
| `getEmployeeHistory` | Rejected; only Team Lead and Project Manager roles are accepted. | Uses assignment history and authorized date intervals. | Requires active organization grant. | No employee-history HTTP route; service is not called. |
| `getOrganizationDay` | Rejected 403. | Rejected 403. | Requires active Project Manager and active ORGANIZATION grant. | No organization-day HTTP route; service is not called. |
| `getOrganizationHistory` | Rejected 403. | Rejected 403. | Requires active Project Manager and active ORGANIZATION grant. | No organization-history HTTP route; service is not called. |
| `getSubmissionDetail` | Requires the metadata record’s employee ID to equal actor ID. | Requires assignment on the record’s reporting date. | Requires active Project Manager and active ORGANIZATION grant. | `/:submissionId` exists, validates the ID, then controller returns 501. |

**Authorization findings**

- Team Member identity is not accepted from request parameters in `getOwnDay`, `getOwnCurrent`, or `getOwnHistory`; those services use `actor.id`. The generic `getEmployeeDay` operation separately checks equality for Team Members.
- Team Lead assignment queries use employee ID and inclusive effective date bounds. A single assignment for another Team Lead is forbidden; multiple matching rows fail closed as an integrity error. The range helper validates all overlapping assignments and rejects inclusive overlap across leads.
- Team Lead history builds a `$or` from authorized ranges and applies it to both the page query and count query before pagination.
- Project Manager authorization queries persisted grants with `scope: "ORGANIZATION"` and `active: true`; revocation therefore removes eligibility. Caller-provided booleans are not read by the grant helper.
- Detail authorization is based on the fetched MetricSubmission metadata (`employeeId`, `reportingDate`), not an employee ID supplied by the caller.
- **Finding MEDIUM:** `getOwnDay` and `getOwnCurrent` do not enforce `actor.role === "team_member"`. They route Team Leads and Project Managers through their other authorization paths for the actor’s own employee ID. This does not by itself let them select another employee, but it violates the specified self-service role boundary. Add explicit role checks and regressions before enabling those operations.

### Request flow and endpoint-level gap

`src/server.js` mounts the router at `/api/daily-submissions`. The router sets standard API error formatting, runs the store-readiness guard, then `authMiddleware`, then role middleware. The four current GET routes are `/me/history`, `/me/current`, `/me/:reportingDate`, and `/:submissionId`. Each permits all three supported roles at the route layer. Each controller method currently returns `501 NOT_IMPLEMENTED`; none calls a read service. The service also has four employee/organization operations that have no HTTP route.

`authMiddleware` verifies the JWT and looks up the user by the JWT ID; the database supplies the current role. That lookup selects `email role name`, so `req.user` has no guaranteed fresh `active` property. Login tokens contain ID, email, role, and name, not active status. `loadSubmissionActor` does select fresh active and roster fields, but the daily-submission router currently uses it only for the disabled POST handler. A future GET controller that passes `req.user` directly would fail the read service’s Team Lead/Project Manager `active === true` checks. It should load the server-side actor before invoking the service.

With valid authentication, an allowed role, a ready store, and valid detail ID, the current GET controllers return 501. Middleware can correctly return 503 for unavailable readiness, 401 for authentication failures, 403 for unsupported roles, and 400 for an invalid detail ID before a controller is reached. The POST controller is also a 501 stub; role, payload, readiness, and active-account checks can return their respective errors before that stub.

## C. Database query inventory

All queries inside the eight read-service operations are awaited sequentially and receive the transaction session. No `Promise.all()` is used. `readTransaction.js` starts one session, runs the operation in `withTransaction()` using `readPreference: "primary"` and `readConcern: { level: "snapshot" }`, and closes the session in `finally`.

| Operation/location | Model and database operation | Session | Observation |
|---|---|---:|---|
| HTTP authentication, before controller/service | `User.findById(decoded.id).select("email role name")` in `auth.js` | No | Separate authentication read, before the read transaction. GET controller currently stops at 501. |
| `getOwnDay`, `getOwnCurrent`, `getEmployeeDay`; Team Lead authorization | `EmployeeReportingAssignment.find(...)` in `submissionReadAccessService.js` | Yes | Effective start `<= reportingDate`; end is null or `>= reportingDate`. |
| Same operations; Project Manager authorization | `SubmissionAccessGrant.findOne(...)` through `submissionAccessGrantService.js` | Yes | Filters active ORGANIZATION grant. |
| Same operations | `ExpectedSubmission.findOne(...)` | Yes | Read after authorization. |
| `attachMetricSubmission`, non-submitted states | `MetricSubmission.findOne({ employeeId, reportingDate })` | Yes | Detects orphan submissions for Pending, Missing, and Excluded states. |
| `attachMetricSubmission`, submitted states | `MetricSubmission.findOne({ _id, employeeId, reportingDate })` | Yes | Checks record identity, status, policy version, and deadline consistency. |
| `getOwnHistory` | `ExpectedSubmission.find(filter)` and `ExpectedSubmission.countDocuments(filter)` | Yes, both | Same employee/date filter, same session; page query sorts and paginates. |
| `getEmployeeHistory`; Team Lead range calculation | `EmployeeReportingAssignment.find(...)`, then per-record assignment `find(...)` recheck | Yes, all | History range and each returned date use the same snapshot. |
| `getEmployeeHistory` | `ExpectedSubmission.find(filter)` and `countDocuments(filter)` | Yes, both | `$or` authorized date ranges are included before both page and count. |
| `getOrganizationDay` | Grant `findOne`, `ExpectedSubmission.find`, `countDocuments`, per-row MetricSubmission `findOne` | Yes, all | Sequential grant, expected-day, count, and detail reads. |
| `getOrganizationHistory` | Grant `findOne`, `ExpectedSubmission.find`, `countDocuments`, per-row MetricSubmission `findOne` | Yes, all | Same session; date filter applies to page and count. |
| `getSubmissionDetail` | `MetricSubmission.findById` metadata query | Yes | Selects only `_id employeeId reportingDate` for authorization. |
| `getSubmissionDetail` | Assignment query or grant lookup | Yes | Based on the metadata record’s employee/date. |
| `getSubmissionDetail` | `ExpectedSubmission.findOne` and final MetricSubmission `findOne` | Yes, both | Expected row must be submitted and link back to the metadata record. |

The transaction runner has no nontransactional fallback. Disconnected state throws before session creation; read-service wrappers preserve `SubmissionApiError` responses and map unexpected database errors to a generic 503. Auth middleware is not part of the service transaction, which is acceptable as an authentication precondition but means actor status must be freshly loaded for service authorization.

## D. Data integrity findings

| Invariant | Review result |
|---|---|
| Submitted ExpectedSubmission has a corresponding MetricSubmission | Checked; missing document fails with `DATA_INTEGRITY_ERROR`. |
| Submission ID matches | Checked by ExpectedSubmission lookup filter and submission metadata. |
| Employee ID and reporting date match | Checked by lookup filters and explicit field comparisons. |
| Expected and metric status match | Checked. |
| Policy version matches | Checked. |
| Applicable deadline timestamps match | Checked after finite-date validation of the expected and submission deadlines. |
| Pending/Missing/Excluded have no reference and no orphan MetricSubmission | Reference/status combinations are checked; a session-bound lookup rejects an orphan document. Excluded rows also require an exclusion reason. |
| Actual submission timestamp is valid | **Insufficient:** code checks only truthiness. An invalid Date object/string is truthy and is not rejected as an invalid timestamp. |
| Punctuality status agrees with timestamps | **Missing:** the service does not recompute On-Time/Late from `actualSubmittedAt` and `applicableDeadlineAt`. Matching but contradictory status values can be returned. |
| `ExpectedSubmission.statusEvaluatedAt` agrees with submission timestamp | **Missing:** the service does not validate this field for submitted records. |

**Finding HIGH — read integrity:** in `dailySubmissionReadService.js`, `attachMetricSubmission()` verifies deadline equality and status equality but not timestamp validity, punctuality classification, or `statusEvaluatedAt`. Add finite timestamp validation, compare the expected evaluation timestamp with `actualSubmittedAt`, and recompute On-Time/Late before returning a submitted record. Add focused negative tests.

## E. Pagination and reporting findings

- Reporting dates are validated as real `YYYY-MM-DD` values before string-order comparisons; date-range start must not exceed end.
- Page and limit are numeric integers; page and limit must be positive, and limit is capped at 100. Invalid page zero is covered. Tests do not explicitly cover the maximum, values above the maximum, malformed numeric strings, or a page beyond the final page.
- History page reads use `sort`, `skip`, and `limit`; `countDocuments()` receives the same filter and session. Since both run in the same snapshot transaction, page and count reflect one snapshot.
- Team Lead history applies assignment-derived date ranges to both filter and count before pagination. The test suite includes a page-size-one case verifying unauthorized dates are excluded before total counting.
- Sorting is stable for the current unique keys: member/employee histories sort by reporting date while employee ID is fixed; organization day sorts by employee ID; organization history sorts by reporting date and then employee ID. The schemas declare unique employee/date indexes for both expected and metric records. Tests do not explicitly verify equal-date organization ordering or page-to-page stability.
- Empty employee-history assignment ranges return an empty page and zero count without reading expected records.

## F. Security findings

| Severity | Finding |
|---|---|
| HIGH | Submitted read integrity does not validate timestamp validity, punctuality classification, or status-evaluation timestamp; see Section D. |
| MEDIUM | `getOwnDay` and `getOwnCurrent` do not explicitly reject Team Lead/Project Manager roles. They remain self-bound, so this is a role-policy inconsistency rather than demonstrated cross-employee leakage. |
| MEDIUM | Read controllers are not connected to read services, and GET route role lists permit all supported roles even on `/me/*` routes. This is not currently a data exposure because all controllers return 501, but endpoint role mapping must be corrected and tested before enablement. |
| MEDIUM | GET middleware supplies a fresh role but not a fresh active status. A future controller must use `loadSubmissionActor` (or equivalent) so active Team Lead/Project Manager checks receive server-side state. Current service behavior fails closed when `active` is absent. |
| LOW | API-level GET tests do not exercise all four routes’ success-to-501 behavior or role combinations; the detailed role coverage is service/helper-level only. |
| INFORMATIONAL | Response formatting returns selected submission fields and metrics, not full User documents. Auth middleware selects only email, role, and name; `loadSubmissionActor` selects only identity, role, active, and roster fields. Internal read errors are mapped to generic 503 responses; the standard error handler logs the error name rather than returning a stack trace. |

No direct cross-team data leakage was established in the read services: Team Lead authorization is tied to persisted assignments for the requested employee and dates. Project Manager organization scope is tied to a persisted active grant. The HTTP controllers do not currently expose read data.

## G. Route/controller findings

- `dailySubmissionRoutes.js` registers POST `/`, GET `/me/history`, GET `/me/current`, GET `/me/:reportingDate`, and GET `/:submissionId` under the server mount `/api/daily-submissions`.
- `dailySubmissionController.js` returns `501 NOT_IMPLEMENTED` for POST and each of the four GET controller methods. No GET method calls `dailySubmissionReadService.js`; the employee and organization read operations have no route.
- Route authentication and supported-role checks precede the GET stubs. Detail IDs are validated before its controller. Readiness precedes authentication.
- POST uses an Express 4 async wrapper and remains disabled. GET handlers are synchronous stubs today. With Express 4.22.1, future async controller handlers should use the same `asyncRoute` wrapper or explicit `next(error)` handling; Express 4 does not automatically forward rejected async-handler promises.
- Valid authenticated requests with supported roles and valid input reach 501. Middleware may return 401/403/503 and invalid detail IDs return 400 before the stub; the API test suite also documents these pre-controller outcomes.

## H. Test coverage matrix

Named tests inspected:

- `test/submission-read-access-service.test.js`
- `test/daily-submission-read-service.test.js`
- `test/read-transaction.test.js`
- `test/submission-access-grant-service.test.js`
- `test/daily-submissions-api.test.js`

| Area | Existing coverage | Gaps |
|---|---|---|
| Team Member self/identity | Helper self-ID check; service own day/history; service rejects Team Lead on own-history. | The “cannot retrieve another employee” service test has no other employee fixture and resolves 404; add an explicit `getEmployeeDay` cross-ID denial test. Add wrong-role tests for `getOwnDay` and `getOwnCurrent`. |
| Team Lead history | Helper tests inclusive start/end, no match, another lead, overlap, inactive lead, and database failure. Service tests assigned/unassigned and date filtering before pagination/count. | No endpoint-level Employee Day/History tests; no explicit cross-team HTTP denial. Detail authorization for Team Lead is not covered. |
| Project Manager | Grant helper tests active/inactive/no grant/database failure; grant service tests session propagation and revoke operation. | No explicit read-after-revocation test; no Project Manager detail authorization test; no endpoint-level organization-role test. |
| Sessions/transactions | Service mocks assert session identity on Team Lead assignment, expected/metric queries, counts, and Project Manager grant; grant service checks supplied session; runner checks primary snapshot options, cleanup, retry, and disconnected behavior. | No real MongoDB transaction test was run or requested in this review. |
| Integrity | Missing metric, mismatched status/policy/deadline, orphan metrics for non-submitted days, invalid expected deadline are covered. | Missing tests for invalid `actualSubmittedAt`, status versus punctuality timestamps, and `statusEvaluatedAt` mismatch. |
| Pagination | Basic pagination, invalid page zero, Team Lead filtering before count, and empty authorized range. | No explicit max-limit boundary, malformed page/limit strings, beyond-last-page case, or deterministic organization tie-order/page-stability assertion. |
| HTTP boundary | Router paths, auth errors, unsupported roles, POST disabled path, and one authenticated GET reaching a 501 stub are represented. | No full GET route matrix, no endpoint-level Team Lead/PM read checks, no HTTP tests for all four GET stubs. |

## I. Remediation plan

1. **Before enabling reads:** In `src/services/dailySubmissionReadService.js`, validate that `actualSubmittedAt` is a finite instant; recompute status from actual/deadline; require `statusEvaluatedAt` to match the actual submission time. Add named unit regressions in `test/daily-submission-read-service.test.js`.
2. **Before exposing self-service endpoints:** Add explicit Team Member role enforcement to `getOwnDay` and `getOwnCurrent`, with negative role tests. Keep employee identity derived from the authenticated actor.
3. **Before wiring controllers:** Update `src/controllers/dailySubmissionController.js` and `src/routes/dailySubmissionRoutes.js` to map intended routes to read-service operations, load a fresh server-side actor including active status, validate query parameters, constrain `/me/*` routes to the intended roles, and wrap async controller methods for Express 4.
4. Add endpoint-level tests in `test/daily-submissions-api.test.js` for every GET path, valid and invalid roles, cross-employee and cross-team access, Project Manager active/revoked grants, and detail authorization. Keep the route returning 501 until separately approved.
5. Add explicit pagination boundary and ordering tests, including organization sort ties and stable page continuation.
6. After remediation and review, plan a controlled isolated integration run. Do not use production data or broaden test discovery.

## J. Readiness decision

**NOT READY — REMEDIATION REQUIRED**

The transaction/session implementation is consistent and offline service suites pass, but submitted-record integrity checks are incomplete and self-service role constraints are inconsistent. More fundamentally, HTTP read endpoints are deliberately 501 stubs and do not invoke the services; endpoint-level authorization has therefore not been demonstrated. The implementation should remain disabled pending the prioritized fixes and endpoint tests.

## Test execution and safety

Explicit offline test commands run:

| Command | Result |
|---|---:|
| `node --test test/submission-read-access-service.test.js` | 17 passed, 0 failed |
| `node --test test/daily-submission-read-service.test.js` | 30 passed, 0 failed |
| `node --test test/read-transaction.test.js` | 5 passed, 0 failed |
| `node --test test/submission-access-grant-service.test.js` | 16 passed, 0 failed |
| `node --test test/daily-submissions-api.test.js` | 5 passed, 12 failed at the local HTTP fetch step because the sandbox denied loopback TCP (`EACCES`); not an application assertion failure |

No broad test discovery, MongoDB connection, integration test, database operation, external integration, `.env` read, or source-code modification occurred. The `submission_corrections` collection and schema were not inspected or modified. The POST and GET controllers remain `501 NOT_IMPLEMENTED`.
