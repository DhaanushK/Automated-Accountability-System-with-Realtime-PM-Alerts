# Daily Submission Read Integration Plan

**Phase:** 3B.7.9 — Read-service integration planning  
**Review type:** Read-only architecture and implementation plan  
**Repository:** `D:\Automated Accountability System\finalyear-backend`  
**Date:** 2026-11-13

## Executive summary

The project has a substantial read-service layer with role-specific authorization, record-integrity checks, pagination, and a shared MongoDB snapshot transaction. The daily-submission controllers remain 501 stubs. `/me/*` routes already restrict access to Team Members, while the detail route allows the three supported roles into a stub; it does not itself authorize a record. Employee and organization routes do not exist.

The service contracts are suitable for staged wiring, but two decisions/guardrails should be settled before enabling reads:

1. **Inactive Team Member reads:** the service intentionally permits Team Members to read their own historical data after deactivation. Decide whether this remains the policy; do not apply the POST-only active-account check indiscriminately to GETs.
2. **Actor and snapshot consistency:** actor role/active data is loaded outside the read service’s snapshot transaction. Privileged assignment/grant and reporting data reads do use the transaction session. Decide whether the current “fresh before service call” actor contract is sufficient or whether actor lookup must be included in the transaction before enabling privileged reads.

All future async GET handlers must also forward rejected promises explicitly because the application uses Express 4.22.1. These are implementation guardrails, not reasons to change the existing 501 behavior in this planning phase.

**Readiness:** Architecture is suitable for controlled, staged implementation after the above decisions are resolved and endpoint-level tests are added. It is not ready for endpoint activation as-is.

## Severity summary

| Severity | Finding |
|---|---|
| MEDIUM | Fresh actor lookup occurs outside the read transaction snapshot; actor role/active can be from a different point in time than grants, assignments, and reporting records. |
| MEDIUM | Team Member inactive-account policy is ambiguous: authentication is fresh, but read authorization intentionally permits inactive members to retrieve their own historical records. |
| MEDIUM | Express 4 does not automatically forward rejected async GET controller promises; current GET routes are not wrapped in `asyncRoute()`. |
| LOW | History and organization reads perform sequential per-record integrity/metric lookups inside the transaction, up to the configured page limit. Watch transaction duration and query counts. |
| LOW | The current API tests validate route gates and 501 stubs, not HTTP-to-read-service argument mapping or record-level authorization. Add those only as each endpoint is enabled. |
| INFORMATIONAL | Future `/employees/*` and `/organization/*` routes must be registered before the generic `/:submissionId` detail route. |

No CRITICAL finding was identified in the currently disabled endpoint state.

## 1. Current architecture

### Authentication and routing

`src/routes/dailySubmissionRoutes.js` creates a router with an injectable readiness check, clock, and actor loader. It marks requests for standardized errors, checks store readiness, then runs `authMiddleware`. The auth middleware verifies JWT signatures using `JWT_SECRET`, loads the User by the token’s `id`, and overwrites `req.user.role`, email, and name with persisted values. It does not load `active` in this first lookup (`src/middleware/auth.js:36-80`).

Current route boundary:

- `GET /me/history`, `/me/current`, and `/me/:reportingDate`: `team_member` only (`src/routes/dailySubmissionRoutes.js:51-64`).
- `GET /:submissionId`: `team_member`, `team_lead`, or `project_manager`; validates ObjectId before its controller (`:66-74`). Actual record authorization is not performed in the route.
- `POST /`: Team Member only, validates request, loads an actor, checks active Team Member, then calls its still-disabled controller (`:38-47`). POST is outside this plan.
- No employee or organization GET routes currently exist.

The controller (`src/controllers/dailySubmissionController.js:1-28`) returns `501 NOT_IMPLEMENTED` for every operation. The route imports the singleton controller. The router factory does not currently inject a controller or read service.

### Actor loading

`getAuthenticatedUserId()` validates the JWT-derived authenticated ID. `loadSubmissionActor()` performs a fresh User lookup for `_id`, `role`, `active`, team and manager fields (`src/services/submissionAccessService.js:4-34`). `assertActiveTeamMember()` is the write path’s role/active check (`:36-53`).

For GET integration, use a freshly loaded actor and its persisted role/identity; never use a request parameter as the Team Member identity. Active-account policy must follow the read service contract rather than blindly reusing the POST guard. The current Team Member read helper explicitly allows historical self-read when `active: false` (`src/services/submissionReadAccessService.js:48-73`). Team Lead and Project Manager read authorization require active actors.

### Read transaction and error mapping

`runReadTransaction()` refuses to start unless the Mongoose connection is ready, opens one session, runs `withTransaction()` using primary read preference and snapshot read concern, and ends the session in `finally` (`src/services/readTransaction.js:14-52`). There is no nontransactional fallback. Read-service query chains pass the same session to expected/metric, assignment, and grant reads; per-record checks are sequential.

`dailySubmissionReadService.executeRead()` preserves known `SubmissionApiError`s and maps unexpected failures to a generic 503 `DATABASE_UNAVAILABLE` (`src/services/dailySubmissionReadService.js:170-185`). `formatSubmissionError()` maps known service errors to standard JSON and replaces non-501 server-error messages with a safe generic message (`src/services/dailySubmissionService.js:28-48`). The production server’s daily-submission error branch uses the same formatter (`src/server.js:116-122`).

## 2. Existing read-service contracts

Common behavior:

- Every function accepts a `models` override for offline testing; omitted models use the registered Mongoose models and production read-transaction runner.
- Database operations execute inside the configured read transaction. Validation, authorization, and integrity errors use `SubmissionApiError`; generic transaction/database failures become 503.
- A reporting record is built from an `ExpectedSubmission`. Submitted states include a nested `submission` object; non-submitted states return `submission: null` after checking for orphan MetricSubmission records.
- Submitted records must have consistent identity, reporting date, status, policy version, deadline, timestamps, and punctuality classification. Violations fail with 500 `DATA_INTEGRITY_ERROR` (`dailySubmissionReadService.js:262-424`).
- Day lookup errors include 400 invalid date/identifier, 403 forbidden, 404 not found, 500 integrity error, and 503 database unavailable.

| Function | Required inputs and actor | Authorization | Return and pagination | Main reads / tests |
|---|---|---|---|---|
| `getOwnDay` (`dailySubmissionReadService.js:481-503`) | `{ actor, reportingDate, models? }`; Team Member actor with `id` and `role` | Explicit Team Member role; actor ID supplies employee ID; self-only assertion before ExpectedSubmission fetch | One formatted expected-day object, containing `submission` or `null`; no pagination | Expected day then metric/integrity lookup in one session. Covered by `daily-submission-read-service.test.js` own-day, role denial, invalid date, not-found and integrity cases. |
| `getOwnCurrent` (`:506-528`) | `{ actor, clock?, models? }`; Team Member actor | Explicit Team Member role; reporting date derived from injected clock in Asia/Kolkata | Same shape as `getOwnDay`; no pagination | Derives date then uses authorized day path. Tests cover clock derivation and role rejection without reads. |
| `getOwnHistory` (`:531-603`) | `{ actor, fromDate, toDate, page?, limit?, models? }`; Team Member actor | Team Member role, actor’s ID only, self-only access | `{ records, pagination }`; page defaults 1, limit 20, maximum 100; date range required | ExpectedSubmission find and count share filter/session; sorted reportingDate descending; metric/integrity joins are sequential. Tests cover history, invalid date range/page and identity. |
| `getEmployeeDay` (`:606-628`) | `{ actor, employeeId, reportingDate, models? }` | Team Member can only request own ID; Team Lead must have exactly one active historical assignment for the date; Project Manager must be active with persisted grant; other roles forbidden | Same day shape; no pagination | Assignment/grant authorization and Expected/Metric reads share transaction session. Tests cover assigned/unassigned Team Lead, PM grant and denial, and data integrity. **For the future employee HTTP routes, enforce the planned Team Lead/Project Manager route role allowlist even though the service also permits a Team Member’s own record.** |
| `getEmployeeHistory` (`:631-767`) | `{ actor, employeeId, fromDate, toDate, page?, limit?, models? }` | Team Lead or Project Manager only. Team Lead sees only inclusive historical assignment intervals; Project Manager needs active organization grant | `{ employeeId, records, pagination }`; page/limit defaults and maximum as above; no authorized Team Lead interval returns empty page | Team Lead ranges are applied to the database filter before pagination and count, and each returned date is rechecked in the same session. PM grant, expected record and count share session. Tests cover authorized intervals, empty range and role/grant paths. |
| `getOrganizationDay` (`:770-832`) | `{ actor, reportingDate, page?, limit?, models? }`; active Project Manager actor | Requires persisted active `ORGANIZATION` grant | `{ reportingDate, records, pagination }`; default page 1 / limit 20, maximum 100 | ExpectedSubmission find/count and all metric consistency checks in one transaction. Sorts by employeeId. Tests cover PM access and Team Lead rejection. |
| `getOrganizationHistory` (`:835-900`) | `{ actor, fromDate, toDate, page?, limit?, models? }`; active Project Manager actor | Requires persisted active `ORGANIZATION` grant | `{ records, pagination }`; date range required; default page 1 / limit 20, maximum 100 | ExpectedSubmission find/count, grant check and integrity reads share session. Sorts by reportingDate descending, then employeeId. Tests cover PM history and grant denial. |
| `getSubmissionDetail` (`:903-963`) | `{ actor, submissionId, models? }`; fresh actor for any supported role | First reads only submission metadata, then authorizes actual employee/date: Team Member self, Team Lead historical assignment, Project Manager active persisted grant. Checks matching ExpectedSubmission before returning detail | One formatted expected-day object with nested submission; no pagination | Metric metadata → role authorization → ExpectedSubmission reference/status → consistency validation. All reads use the same transaction session. Service tests cover authorized Team Member, invalid/nonexistent ID and inconsistent records; role-specific detail cases should be ensured before enabling the route. |

**Input contract caution:** `normalizePagination()` converts values with `Number()` and enforces positive integers plus limit ≤100. HTTP query values arrive as strings; controller validation should require one scalar value per query key and reject repeated/array values and unsupported query keys before calling the service. Do not invent defaults for `fromDate`/`toDate`; the service requires and validates them.

## 3. Authorization requirements and endpoint mapping

| HTTP endpoint | Service | Route/controller authorization and argument mapping |
|---|---|---|
| `GET /me/history` | `getOwnHistory` | Team Member route gate; freshly load actor using authenticated ID. Map `fromDate`, `toDate`, `page`, `limit` from validated query. Never accept `employeeId` from path/query/body. |
| `GET /me/current` | `getOwnCurrent` | Team Member gate; fresh actor; pass injected clock if deterministic controller behavior is needed. Service derives current Asia/Kolkata reporting date. |
| `GET /me/:reportingDate` | `getOwnDay` | Team Member gate; validate path date; fresh actor; pass only actor and reportingDate. |
| `GET /employees/:employeeId/history` | `getEmployeeHistory` | Future route, Team Lead/Project Manager gate; validate employee ObjectId, range and pagination; fresh actor; service performs historical assignment or PM grant authorization. |
| `GET /employees/:employeeId/:reportingDate` | `getEmployeeDay` | Future route, Team Lead/Project Manager gate; validate both IDs/date; fresh actor; service checks assignment at the requested date or PM grant. |
| `GET /organization/history` | `getOrganizationHistory` | Future Project Manager-only route; validate date range and pagination; fresh actor; service requires active persisted grant. |
| `GET /organization/:reportingDate` | `getOrganizationDay` | Future Project Manager-only route; validate date/pagination; fresh actor; service requires active persisted grant. |
| `GET /:submissionId` | `getSubmissionDetail` | Keep supported-role route gate and ObjectId validation. Fresh actor; pass submission ID only. Service must authorize against actual record metadata before returning content. |

The order of future route declarations matters: register fixed `/employees/...` and `/organization/...` patterns before the generic `GET /:submissionId` route so these segments cannot be consumed as detail IDs.

### Fresh identity, roles, inactive accounts

- `authMiddleware` is the first persisted role lookup and is authoritative for the route gate. `loadSubmissionActor()` is the richer, second fresh lookup required to supply `active` and team/manager data to the read service.
- Derive the actor lookup ID only through `getAuthenticatedUserId(req.user)`. Confirm the loaded actor ID matches it before using the actor. Never take identity from the client for `/me/*`.
- The active Team Member policy needs an explicit decision. Current service code permits inactive Team Members to read their own historical records, while Team Lead and Project Manager authorization require active actors. If policy is to deny inactive Team Members, change the service contract and tests in a separately authorized remediation; do not bolt a different rule into only the controller.
- Actor loading currently occurs before entering `runReadTransaction`. Assignment/grant and submission records are snapshot-consistent with each other, but not necessarily with the User role/active fields. Either accept and document this small time-of-check boundary, or extend the service/actor-loading contract so the authoritative User lookup participates in the same session. Do not claim a single snapshot across actor and reporting data until that is implemented and tested.

### Role-specific authorization

- **Team Member:** `assertTeamMemberReadAccess()` compares actor role and authenticated ID to target employee ID. Read service tests explicitly cover own-only access. Team Member historical access is permitted even when inactive.
- **Team Lead:** `assertTeamLeadHistoricalAccess()` queries effective assignments with inclusive start/end dates, requires exactly one match, verifies employee/lead identity, and fails closed for invalid/overlapping history. History reads derive authorized ranges, apply them before pagination/count, and recheck returned dates. Do not use current User.teamId/managerId alone as proof of historical access.
- **Project Manager:** `assertProjectManagerOrganizationAccess()` requires role, active actor, valid ID, and a persisted query matching `scope: ORGANIZATION` and `active: true`. Grant revocation is respected by that active filter. Organization routes must not trust request booleans or JWT grant claims.
- **Detail:** supported route roles are only an entry gate. `getSubmissionDetail()` must remain the authorization boundary for the metadata-selected employee/date. A 501 HTTP stub test is not evidence of record-level access control.

## 4. Validation, integrity, transactions, and error handling

### Validation

- Service validation rejects invalid calendar dates and reversed date ranges. `getOwnCurrent` is clock-derived; other date-taking endpoints require explicit valid dates.
- Service pagination defaults page=1 / limit=20 and caps limit at 100. Controllers should validate query shape strictly before conversion; no Mongo query should run when inputs are invalid.
- The detail route already validates submission ObjectId before invoking the controller. Future employee routes must validate employee IDs before loading records; services also normalize IDs defensively.
- No GET controller currently validates history query keys or connects the service. Service-level validation is present, but endpoint-level 400 behavior is not yet proven.

### Data integrity

The read service cross-checks expected and metric identities, date, policy version, status, deadline, submission reference, timestamp validity, status-evaluation time, and punctuality classification. A submitted expected record without a metric document, or a non-submitted day with an orphan metric document, returns `DATA_INTEGRITY_ERROR`; records are never repaired in a read path. Output is explicitly constructed from selected metric fields and expected-day fields, rather than returning raw Mongoose documents.

### Snapshot consistency

Read operations use one primary snapshot transaction with session propagation across authorization, expected-day reads, metric lookups, and count queries. The service intentionally performs reads sequentially in the transaction. Preserve this behavior; do not introduce `Promise.all()` across queries sharing the transaction. Session cleanup is in `finally`, with no disconnected fallback.

The main scale concern is sequential joins: a history page may perform one metric lookup for each submitted record, or one orphan check for each non-submitted record, in addition to expected records and counts. The page cap bounds this at 100 rows but can still increase transaction duration. Measure with representative load before increasing page size or changing the query pattern.

### Express 4 async propagation

`asyncRoute()` exists in `dailySubmissionRoutes.js` and is used for POST only. Current GET controllers are synchronous stubs. When connecting a Promise-returning read service, wrap every async GET handler with `asyncRoute()` (including detail after its ID validation) or explicitly `.catch(next)`. A `try/catch` around a function call does not catch a later Promise rejection. Regression tests must force a rejected service promise and assert the safe global error response.

### Safe errors

Service-level 4xx and integrity errors use `SubmissionApiError`; unknown transaction/database errors become generic 503. The production server formats standard daily-submission errors with `formatSubmissionError()`. Future controller tests should verify status and code for validation, forbidden, not found, integrity, and unavailable failures, and assert internal database messages/stack details are absent.

## 5. Existing tests and coverage

| Test file | Relevant existing coverage | Missing before service wiring |
|---|---|---|
| `test/daily-submission-read-service.test.js` | All eight service functions, identity/role restrictions, historical assignment ranges before pagination, PM grant paths, pagination/date validation, integrity status/deadline/timestamp cases, missing records | HTTP controller argument mapping; fresh actor + service call as one request; service rejection forwarded through actual GET route; explicit detail authorization for Team Lead and Project Manager; strict query scalar/unknown-key behavior |
| `test/submission-read-access-service.test.js` | Team Member self-only; Team Lead active/historical inclusive assignment, no match/other lead/overlap/error; PM active grant and denial | Endpoint integration; ensure authorization helper is invoked before metrics/expected detail is exposed via HTTP |
| `test/submission-access-grant-service.test.js` | Persisted active ORGANIZATION grant lookup, session propagation, inactive PM, revocation and grant-management errors | Organization GET route wiring and route-to-service mapping |
| `test/read-transaction.test.js` | Unavailable connection, primary/snapshot options, shared session callback, cleanup on failure, retry callback | Read-service-to-HTTP failure forwarding; no live transaction test in this planning phase |
| `test/daily-submissions-api.test.js` | JWT failure/missing user/database failure, persisted role precedence, active actor decision seam, readiness order, role gates, invalid ID/request, 501 stubs | Currently uses controller stubs; it does not call the read service. Keep detail record-level authorization claims out of this suite until service is wired. |

Do not count the service helper tests as endpoint-level tests. Add route/API tests at each implementation stage and retain the independent service tests.

## 6. Controller and dependency-injection recommendations

1. Preserve a disabled-by-default controller set whose methods continue returning 501. Do not make service activation an accidental side effect of importing a router.
2. Introduce a narrowly scoped controller/router factory seam for `readService`, actor loader, and clock. Default dependencies must preserve the disabled behavior until the explicit implementation stage is authorized.
3. For each enabled operation, the controller should: validate/normalize request parameters; obtain authenticated ID; load a fresh actor; confirm actor ID matches authenticated ID; apply the chosen active-account policy; call exactly one read-service function with explicit arguments; return the service result through a stable success envelope.
4. Use only query/path fields that the endpoint contract allows. `/me/*` must ignore or reject client-selected employee identity. Employee routes may accept employeeId only because their role gate and service authorize that target.
5. Wrap asynchronous controller operations with `asyncRoute()` for Express 4. Keep the shared error middleware responsible for the standard response envelope; do not return raw errors or Mongoose documents.
6. Register future employee/organization routes before `/:submissionId`. Preserve the detail route’s existing supported-role entry gate and let service authorization decide the actual record.
7. Keep every GET and POST disabled until the corresponding endpoint tests and required deployment checks are approved.

## 7. Staged implementation plan

### Stage 0 — Decisions and contracts

- Decide whether inactive Team Members retain self-service historical GET access; current service behavior says yes.
- Decide how the actor User role/active read relates to the read transaction snapshot.
- Freeze query contracts: required date names, accepted query keys, repeated-value handling, page/limit defaults, response envelope, and success status.
- Confirm access grant and assignment source data are maintained operationally; do not generate or assume assignments/grants in this phase.

### Stage 1 — Controller seam and self-service

- Add disabled-by-default dependency injection.
- Wire `/me/current`, `/me/:reportingDate`, and `/me/history` in separate reviewable changes, Team Member only.
- Load actor from authenticated ID and map no client employee ID.
- Add HTTP tests for successful service argument mapping, invalid date/history queries, actor role/active semantics, empty and paginated responses, and rejected service promises.
- Keep service-level authorization and integrity suites passing in explicit offline runs.

### Stage 2 — Submission detail

- Wire `GET /:submissionId` only after route-level tests prove valid IDs reach the service and invalid IDs stop first.
- Test Team Member own record, another employee denial, Team Lead assigned/unassigned historical record, Project Manager grant/revocation, nonexistent submission, and integrity error without confusing a 501 stub with authorization.
- Ensure authorization occurs before returning detail fields; retain the read service’s metadata-first contract.

### Stage 3 — Team Lead employee endpoints

- Add the two `/employees/:employeeId...` routes with explicit Team Lead/Project Manager allowlist.
- Register before the generic detail route.
- Test inclusive assignment boundaries, transfers/history, overlap fail-closed behavior, filters before pagination/count, cross-employee denial, invalid target ID/date, and database-unavailable errors through HTTP.
- Do not authorize based only on current roster fields.

### Stage 4 — Project Manager organization endpoints

- Add the two `/organization...` routes with explicit Project Manager role gate and fresh actor.
- Test active/inactive PM, missing/active/revoked grant, fixed date and date range, pagination, errors, and grant session propagation.
- Keep organization scope derived only from a persisted active grant.

### Stage 5 — Hardening and activation review

- Run only the explicitly named offline test files for each stage; never broad discovery.
- Review safe error output, stable sort keys, query count/transaction duration, data-integrity fail-closed behavior, and response field minimization.
- Keep a final explicit disabled/enablement decision separate from test completion. No route should be enabled merely because unit tests pass.

## 8. Likely future files to modify

Implementation scope will depend on staged approval. Likely touchpoints:

- `src/controllers/dailySubmissionController.js` — injected read methods and request-to-service mapping while preserving default 501 stubs.
- `src/routes/dailySubmissionRoutes.js` — controller injection, async wrappers, and later employee/organization route declarations; keep current `/me/*` Team Member gates and detail role gate.
- `src/services/submissionAccessService.js` — only if the actor/session consistency decision requires session-aware actor loading; otherwise reuse existing `loadSubmissionActor()`.
- `src/services/dailySubmissionReadService.js` — avoid changes unless implementation reveals a confirmed contract defect; this plan does not request service behavior changes.
- `test/daily-submissions-api.test.js` — in-process HTTP mapping, validation, async error, and role-boundary tests.
- `test/daily-submission-read-service.test.js` — only for any service contract changes or uncovered service edge cases.
- `test/submission-read-access-service.test.js`, `test/submission-access-grant-service.test.js`, `test/read-transaction.test.js` — extend only when a changed contract requires regression coverage.

No model, package, `.env`, legacy integration, scheduler, or alert workflow needs modification for the proposed controller integration based on current source inspection.

## 9. Safety, deployment, and limitations

- This plan does not verify the availability of a live MongoDB replica set or production indexes. Read transactions require a transaction-capable deployment and ready Mongoose connection.
- Do not enable an endpoint against a database until read-only index verification, transaction readiness, actor/assignment/grant provenance, and operational monitoring are separately approved.
- Do not access or create grants/assignments as part of read implementation planning. Access remains deny-by-default when persisted authorization evidence is absent or inconsistent.
- Keep GET and POST controllers at 501 until explicit implementation/activation approval. This plan adds no routes and performs no service wiring.
- The in-process API harness is unit-level and offline. Future route-to-service tests should inject fake models and a fake transaction runner; actual MongoDB transaction behavior remains a separately authorized integration concern.
- The response shape exposes employee IDs and submitted metric fields, not User documents. If a UI needs display names, define a separate minimal projection contract; do not return raw User objects.

## 10. Readiness assessment

**Architecture is ready for controlled, staged implementation planning, but requires the Stage 0 decisions above before any read endpoint is wired or enabled.** The read service already provides the core authorization, transaction, pagination, and integrity controls. The key implementation risks are controller argument mapping, Express 4 promise forwarding, the inactive Team Member policy, and the actor-versus-snapshot consistency boundary. Resolve these explicitly, then enable one endpoint group at a time with endpoint-level regression tests. No endpoint was enabled in this phase.

## Scope and safety confirmation

Inspected the requested routes, controller, read/access/grant/transaction services, authentication middleware, relevant models and date utilities, and explicitly named offline read/API tests. Inspection was static only. No tests were run; no server was started; no source code, database, integration database, or external integration was modified or accessed. `.env` and `submission_corrections` were not accessed.
