# Daily Submission Stage 0 Decisions

**Phase:** 3B.7.9 — Stage 0: Policy and Contract Finalization  
**Review type:** Read-only architecture review and proposed decisions  
**Repository:** `D:\Automated Accountability System\finalyear-backend`  
**Date:** 2026-11-14

## Executive decision summary

The current service lets an inactive Team Member read **any own expected reporting day it can find**, including the current date, and lets them retrieve an own submission detail regardless of the detail’s reporting date. The code does not currently distinguish historical from current-day self-service. POST is different: its route freshly loads an actor and `assertActiveTeamMember()` rejects inactive accounts with 403 `ACCOUNT_INACTIVE`.

**Recommended inactive-member boundary:** an inactive Team Member may read only own reporting dates strictly before the current `Asia/Kolkata` reporting date. Deny `/me/current`, deny `/me/:reportingDate` when the date is today or later, and deny detail for an own submission dated today or later. For `/me/history`, require the whole requested interval to end before today; reject a range that overlaps today or future dates rather than silently returning a partial history. This gives “historical” a precise meaning and does not silently expand it to the current day. The policy needs explicit product sign-off before implementation because the stated policy did not previously define these endpoint-specific boundaries.

**Recommended actor/snapshot design:** resolve the authenticated User actor inside the read service’s existing snapshot transaction, using a session-aware injected actor loader. Reuse the JWT-authenticated user ID only as the lookup key; load role/active state from User inside the snapshot. Do not add a nontransactional fallback. This keeps actor, assignment/grant, ExpectedSubmission and MetricSubmission reads at one snapshot and remains mockable offline.

The current read-service contract does not define a successful HTTP envelope. This document proposes HTTP 200 with `{ "success": true, "data": <service result> }`, but that response shape also requires product/API approval before it is frozen.

## 1. Inactive Team Member policy: exact current behavior

| Service function | Current behavior for `actor.role === "team_member"`, `actor.active === false` | Why |
|---|---|---|
| `getOwnDay` | **Permits** own date lookup for any valid reporting date, including current date, provided the actor ID matches and a corresponding ExpectedSubmission exists. | `getOwnDay()` checks only role before the transaction; `assertTeamMemberReadAccess()` verifies role and same employee ID but intentionally does not check `active`. The date validator checks calendar validity only, not whether the date is historical. (`dailySubmissionReadService.js:481-503, 435-478`; `submissionReadAccessService.js:46-65`) |
| `getOwnCurrent` | **Permits** current reporting-day lookup. | It checks only Team Member role, derives today from `getReportingDateAt(clock())`, then uses the same ownership helper, which ignores `active`. (`dailySubmissionReadService.js:506-528`; helper above) |
| `getOwnHistory` | **Permits** own history for any valid `fromDate`/`toDate` range, including a range that includes today, subject to valid pagination. | Role and same-ID access are checked; no active-state or historical-cutoff check exists. (`dailySubmissionReadService.js:531-603`) |
| `getSubmissionDetail` | **Permits** an inactive Team Member’s own detail, including a submission dated today, when the record identity matches their actor ID. It denies another employee’s detail. | Detail metadata supplies employee/date; `authorizeEmployeeDate()` calls the same active-agnostic Team Member ownership helper. (`dailySubmissionReadService.js:903-963, 192-235`; `submissionReadAccessService.js:46-65`) |

This active-agnostic behavior is consistent with the helper’s explicit comment that historical access remains available after deactivation, but it currently grants more than historical access. It also means a Team Member can access a future date if an ExpectedSubmission record exists; the read service validates date format, not date relation to today.

POST already has a separate policy: it validates the request, derives authenticated ID, freshly loads an actor, and calls `assertActiveTeamMember()`. An inactive Team Member gets 403 `ACCOUNT_INACTIVE` before the controller. Preserve this behavior (`dailySubmissionRoutes.js:38-47`; `submissionAccessService.js:36-53`).

### Recommended policy resolution

Define “historical” as a reporting date strictly less than the current reporting date in `Asia/Kolkata` at the start of the request:

- **Active Team Member:** own day, current day, history, and own detail remain available subject to normal ID/date/record checks.
- **Inactive Team Member:** own past day and history entirely ending before today are allowed; `/me/current` is denied; direct day requests for today/future are denied; own detail dated today/future is denied; historical own detail remains allowed.
- **Team Lead / Project Manager:** actor must be active for privileged reads; an inactive actor cannot use privileged access to any employee or organization data.
- **POST:** inactive Team Member remains denied with `ACCOUNT_INACTIVE`.

For history, do not filter out only today’s row and return a misleading partial page. Reject an interval where `toDate >= today` for an inactive actor. Use an injected/captured instant and `getReportingDateAt()` in the submission timezone. Capture that instant once per request, before the retryable transaction callback, so a transaction retry across IST midnight cannot change the request’s date boundary midway through the same logical read.

For detail, the service must inspect metadata to learn the reporting date, authorize ownership, then apply the inactive cutoff before returning detail fields. Do not expose metrics for a current-day detail to an inactive actor merely because the actor owns it.

**Required service distinction:** `getOwnDay`, `getOwnHistory`, and `getSubmissionDetail` need access to a stable current reporting date/injected clock and must enforce the inactive historical cutoff. `getOwnCurrent` must require an active Team Member. Keep Team Member ownership matching independent of current User roster fields.

## 2. Actor and snapshot consistency

### Existing architecture

- `authMiddleware` verifies the JWT, looks up `decoded.id`, and makes the database role authoritative for the route gate (`src/middleware/auth.js:36-80`). This query is outside the read transaction.
- `loadSubmissionActor()` separately loads `_id`, `role`, `active`, `teamId`, `managerId`, and employment bounds, but currently has no session option (`src/services/submissionAccessService.js:12-34`).
- `dailySubmissionReadService` receives a prebuilt `actor` and owns `executeRead()` around each operation (`src/services/dailySubmissionReadService.js:159-185` and exported functions). Its transaction callback receives a session, but actor data is already outside that callback.
- Expected/Metric records, EmployeeReportingAssignment lookups and SubmissionAccessGrant lookups receive the transaction session. The read transaction uses primary preference, snapshot concern, and `endSession()` in `finally` (`src/services/readTransaction.js:14-52`).
- `models` injection and `runReadTransaction` override make service tests offline. Assignment and grant access helpers also accept model/session injection.

The current implementation keeps reporting/assignment/grant reads mutually consistent but does not include actor role/active state in that snapshot. An account can be deactivated or have its role changed after actor loading but before the read transaction begins. A transaction retry can also rerun the read callback while reusing the actor object loaded before the first attempt.

### Architecture comparison

| Option | Snapshot consistency | Race behavior | Testability / complexity | Retry and authority implications |
|---|---|---|---|---|
| **1. Keep actor load outside transaction** | Actor is not in the snapshot; all service data is. | Existing check-to-use window remains. Role/active can change before or during the data snapshot. | Least code change; existing controller and service tests remain simple. | Actor is loaded once and stays fixed across transaction retries. JWT ID remains server-verified, but role/active is a fresh read from a different point in time. This is the current design. |
| **2. Inject a session-aware actor loader into the read operation** | Actor, assignment/grant, expected and metric reads share the same session/snapshot. | Removes the cross-snapshot actor/record authorization race for reads. | Good offline injection: fake `UserModel` and fake transaction runner/session. Requires extending service inputs/transaction context and making `loadSubmissionActor()` accept/require a session for the read path. | `withTransaction()` may rerun the callback; actor loading must be read-only and rerun with the callback’s session. Keep the same authenticated user ID across retries. No fallback without a session. |
| **3. Move actor resolution wholly into the read-service transaction** | Same snapshot guarantee as option 2. | Strongest ownership of authorization context in the data-access layer. | Clear security boundary, but changes all eight service contracts from `actor` to authenticated identity/resolver, increases service coupling to User or a resolver interface, and requires broad test updates. | Resolver runs per transaction attempt and must be side-effect-free. JWT supplies only the lookup ID; persisted User role/active remains authoritative. |
| **4. Have the controller open a transaction and pass its session to a service call** | Can be consistent only if every service query uses that exact session. | Could remove the actor gap if controller also loads actor in that session. | Poor fit: transaction ownership moves out of the service; risks duplicated transaction/error/session policy or nested transactions; current service already starts its own transaction. | Avoid nesting `runReadTransaction()`. Every retry would rerun controller logic, and endpoint handlers become responsible for database lifecycle. |

### Recommendation

Choose **Option 2**, implemented as a read-service transaction context with an injected actor resolver. The controller should pass only a validated authenticated user ID (from `getAuthenticatedUserId(req.user)`) and validated endpoint parameters. Inside the service’s existing `runReadTransaction()` callback, resolve the actor with the callback session, then run role authorization, grant/assignment checks, and data reads with that same session.

Implementation requirements:

1. Add session support to the read-specific actor-loading path (`loadSubmissionActor()` or a sibling resolver). The User query must use `.session(session)` and `.lean()`; the read service must fail closed if no session is provided.
2. Keep JWT identity as the only identity input from the request. Do not accept role, active, manager, team, grant, or employee identity claims as authorization facts.
3. Keep `authMiddleware` as the outer authentication gate; the in-transaction actor lookup is a second authoritative read for service authorization. If the User no longer exists, return 401; if the persisted role/active state changed, apply the current policy and deny as appropriate.
4. Resolver calls are read-only and may be repeated by transaction callback retries. Do not send notifications, mutate state, or derive a different identity on retry.
5. Inject User model/resolver and transaction runner for offline tests. Do not add nontransactional fallback if the database is unavailable or a session cannot be acquired.
6. Preserve POST’s existing actor loading and disabled response; this decision is for read operations only.

This retains a small outer authentication read for JWT verification and route gate. The service’s in-transaction authorization remains authoritative for whether the record read is allowed. If the product instead requires the initial route role decision itself to be in the same snapshot, a broader auth middleware redesign would be needed; that is not required to keep data access safe because the service rechecks the actor.

## 3. Proposed HTTP contracts

### Shared contract rules

- Dates are date-only strings in exact `YYYY-MM-DD` format. They are interpreted as reporting calendar dates in `Asia/Kolkata`, not converted from a client timezone. Date ranges are inclusive.
- History endpoints require both `fromDate` and `toDate`; service does not define defaults for them. `fromDate > toDate` is rejected.
- `page` and `limit` are optional scalar base-10 positive integers. Defaults: `page=1`, `limit=20`; maximum `limit=100`. Reject arrays/repeated values, empty values, signs, decimals, exponent forms, non-digits, zero, negatives, and values over the maximum.
- Reject unsupported query keys with 400. Do not silently ignore them. This prevents misspelled filters from appearing to succeed.
- No endpoint accepts an employee identity in query/body except the two explicit employee paths. `/me/*` identity always comes from the authenticated actor. Query identity supplied to `/me/*` is rejected as unsupported.
- For endpoints without query parameters, reject any query key. For day/detail routes, `page`/`limit` are accepted only where the service supports them (`getOrganizationDay`); do not add pagination to `getOwnDay`, `getEmployeeDay`, or detail.
- Proposed success response: HTTP 200, `{ "success": true, "data": <service return value> }`. The service returns data objects, not an HTTP envelope; this wrapper is a proposal and requires human approval before implementation.

### Endpoint matrix

| Endpoint | Allowed roles | Actor and parameters | Query / pagination | Success contract | Expected errors |
|---|---|---|---|---|---|
| `GET /me/current` | Team Member | Fresh actor resolved from authenticated JWT user ID. No path params. Inactive actors denied under recommended policy. | No query keys. Current date derived from captured clock in `Asia/Kolkata`. | 200 `{success:true,data: dayRecord}`; service day shape with `submission` object or `null`. | 401 `UNAUTHENTICATED`; 403 `FORBIDDEN`/`ACCOUNT_INACTIVE`; 404 `NOT_FOUND`; 500 `DATA_INTEGRITY_ERROR`; 503 `SUBMISSION_STORE_UNAVAILABLE` or `DATABASE_UNAVAILABLE`. |
| `GET /me/:reportingDate` | Team Member | Fresh authenticated actor; date from path. Active actor may request an existing valid reporting date. Inactive actor only if date is before today IST. | No query keys. | 200 day record envelope. | 400 `INVALID_REPORTING_DATE` for invalid calendar date; 400 `VALIDATION_ERROR` or 403 `ACCOUNT_INACTIVE` for disallowed current/future date for inactive actor (choose consistent policy mapping); 401/403/404/500/503 as above. |
| `GET /me/history` | Team Member | Fresh authenticated actor; no employee ID. | Required `fromDate`, `toDate`; optional `page`, `limit`. Inactive actor requires `toDate < today IST`. | 200 `{success:true,data:{records,pagination}}`; pagination includes page, limit, total, totalPages. | 400 `INVALID_REPORTING_DATE` for malformed date; 400 `VALIDATION_ERROR` for reversed range/pagination/unsupported or repeated keys; 403 `ACCOUNT_INACTIVE` if range includes today/future; auth/not-found/integrity/unavailable errors as applicable. |
| `GET /employees/:employeeId/:reportingDate` | Team Lead, Project Manager | Fresh actor; validate employee ObjectId and date. Service supports Team Lead historical assignment or PM grant. | No query keys. | 200 day record envelope. | 400 `INVALID_REQUEST` for malformed employee ID; 400 `INVALID_REPORTING_DATE`; 403 `FORBIDDEN` on wrong role, inactive privileged actor, outside assignment or missing/revoked PM grant; 404/500/503. |
| `GET /employees/:employeeId/history` | Team Lead, Project Manager | Fresh actor; employee ObjectId from path. Team Lead history must filter to authorized historical ranges before count/pagination; PM grant required. | Required `fromDate`, `toDate`; optional `page`, `limit`. Strict scalar allowlist. | 200 `{success:true,data:{employeeId,records,pagination}}`. | 400 invalid ID/date/range/pagination; 403 forbidden/inactive/no grant/no authorized range (service returns empty page for no authorized Team Lead interval in history); 500 integrity; 503 unavailable. |
| `GET /organization/:reportingDate` | Project Manager | Fresh active PM actor; date path; service checks persisted active `ORGANIZATION` grant. | Optional `page`, `limit` only; strict scalar allowlist. | 200 `{success:true,data:{reportingDate,records,pagination}}`. | 400 invalid date/pagination; 403 missing/revoked grant or inactive/wrong role; 500 integrity; 503 unavailable. |
| `GET /organization/history` | Project Manager | Fresh active PM actor; persisted grant. | Required `fromDate`, `toDate`; optional `page`, `limit`. | 200 `{success:true,data:{records,pagination}}`. | 400 invalid date/range/pagination/unknown or repeated key; 403 no grant/inactive/wrong role; 500 integrity; 503 unavailable. |
| `GET /:submissionId` | Team Member, Team Lead, Project Manager | Fresh actor; ObjectId path. Service loads metadata then authorizes actual owner/date and verifies ExpectedSubmission linkage. Under recommended inactive policy, own detail only if its reporting date is historical. | No query keys. | 200 day/detail record envelope. | 400 `INVALID_REQUEST`; 401 unauthenticated; 403 unauthorized/inactive current detail/no assignment/no grant; 404 no submission; 500 integrity; 503 unavailable. |

**Error-code alignment note:** Route validation already uses `INVALID_REQUEST` for invalid detail ObjectIds, whereas direct read-service ID normalization uses `VALIDATION_ERROR`. Freeze the HTTP contract at the route/controller boundary: malformed path IDs should return `INVALID_REQUEST`; service-level errors may keep their direct-service codes. Invalid dates currently use `INVALID_REPORTING_DATE`; reversed ranges and pagination use `VALIDATION_ERROR`. Unsupported/repeated query behavior is not implemented and needs the proposed 400 mapping.

**Response-shape decision:** `dailySubmissionReadService` currently returns service data only. Existing 501 controllers return `{success:false,error:{code,message}}`, but no successful GET envelope exists. Approval is required for the proposed `{success:true,data}` wrapper; do not make client assumptions until approved.

## 4. Route ordering, validation, and asynchronous handling

- Keep `/me/*` routes Team Member-only. No client-provided identity may influence actor resolution.
- Register `/employees/:employeeId/history` before `/employees/:employeeId/:reportingDate` so the literal `history` cannot be interpreted as a reporting date. Register `/organization/history` before `/organization/:reportingDate` for the same reason. Place these fixed route families before the generic detail route for clarity and future safety.
- Validate path IDs, dates, accepted query names, scalar/repeated values, range ordering, and pagination before starting service database reads wherever possible. The service must retain its own defensive validation.
- Every Promise-returning GET controller must be wrapped by existing `asyncRoute()` or use explicit `Promise.resolve(...).catch(next)`. Current GET routes pass synchronous stub functions directly. Express 4 does not automatically forward rejected promises from async handlers. The detail route’s current `try/catch` catches synchronous validation only; when its controller becomes async, rejection must also flow to `next(error)`.
- The actual record authorization stays inside the read service. A role allowlist at the route is only a pre-gate, not permission to read the selected record.

## 5. Stage 0 decision table

| Decision | Recommended choice | Reasoning | Existing behavior | Required implementation changes | Required regression tests |
|---|---|---|---|---|---|
| Inactive Team Member historical boundary | Allow only own dates `< current IST reporting date`; deny `/me/current`, current/future day, overlapping history, and current/future own detail. | Implements “historical only” without silently treating current reporting day as history. | Inactive member currently passes all own day/current/history/detail service checks. | Add stable clock/date cutoff to read service; enforce before returning current/detail data; keep POST guard. | Active/inactive tests for each of four reads; past vs today vs future; history ending yesterday vs overlapping today; detail own past/current and another employee. |
| Team Lead / PM active requirement | Require a fresh active actor for all privileged reads; inactive actor cannot access another employee/org even with assignment/grant. | Matches confirmed policy; helpers already deny inactive TL/PM. | Service authorization helpers require active for TL/PM; controller not wired. | Load actor freshly in transaction and pass it to services. | HTTP/service tests with inactive TL assignment and inactive PM active grant; no data query follows denial. |
| Actor and records transaction snapshot | Session-aware actor loader invoked inside existing read transaction, same session as reporting/assignment/grant reads. | Eliminates actor-versus-data snapshot mismatch without moving transaction ownership to controller. | Actor supplied before `runReadTransaction`; read data uses snapshot session. | Add session argument to read actor loader and service context/injection; no sessionless fallback on read path. | Assert exact session on User, ExpectedSubmission, MetricSubmission, assignment and grant query mocks; simulate callback retry and ensure read-only resolver re-runs with same authenticated ID/session per attempt. |
| Request identity source | Authenticated JWT ID only; reload persisted actor; never use client IDs for `/me/*`. | Prevents identity selection and keeps database role/active authoritative. | `/me/*` routes have Team Member role gate; services use actor.id; controllers remain stubs. | Controller passes authenticated ID to transaction-aware actor resolver; strict query allowlist rejects client identity fields. | Non-default JWT ID forwarded; query/body employeeId rejected; DB role overrides forged role; actor ID match asserted. |
| History query shape | Require inclusive from/to; page=1, limit=20; max limit=100; reject unknown/repeated/non-scalar query values. | Follows service-required date range and pagination defaults while avoiding ambiguous query coercion. | Service validates range/pagination but no HTTP query parser exists. | Controller boundary strict parser; preserve service validation as defense in depth. | Missing range; invalid calendar date; reversed range; repeated keys; arrays; unknown keys; zero/negative/decimal/exponent; limit 100 accepted, 101 rejected. |
| Success response | Propose HTTP 200 with `{success:true,data:result}`; obtain API/product approval before freezing. | Existing service result is not an HTTP envelope; a stable wrapper is needed. | 501 error envelope only. | Controller serializes the proposed envelope without returning raw model documents. | Controller/API contract tests for all response shapes and pagination. |
| Errors | Keep existing standard errors; malformed HTTP IDs use `INVALID_REQUEST`; service invalid date/range/pagination preserve `INVALID_REPORTING_DATE` / `VALIDATION_ERROR`; unknown DB failures remain generic 503. | Consistency with existing formatters while keeping internal failures hidden. | Service/error formatter mappings exist; HTTP GETs do not call services. | Use async error forwarding and global formatter; do not expose stack/db text. | Status/code and sanitized body assertions for 400/401/403/404/500/503 and rejected promises. |
| Async handling | Wrap every async GET route/controller using `asyncRoute()`. | Express 4 does not catch rejected controller promises. | Helper exists but GET stubs are synchronous and unwrapped. | Wrap current GET route handlers when each is wired. | Inject a rejected service promise for every handler family; assert standardized error response. |
| Route ordering | Put organization history before organization date; employee history before employee date; route groups before generic detail. | Prevent literal names from being consumed by parameterized sibling paths and retain easy-to-audit route structure. | Only self routes and generic detail exist. | Add routes in specificity order. | Route table/path tests and requests to `history` paths reach history controllers. |

## 6. Human approval required

1. **Inactive current-day policy:** confirm the recommended strict historical-only cutoff: inactive Team Members cannot call `/me/current`, cannot retrieve today/future via `/me/:reportingDate`, and cannot retrieve today/future own detail. The product statement establishes historical access but did not explicitly state these endpoint outcomes.
2. **Success response envelope:** approve or replace the proposed 200 `{success:true,data}` shape. No successful daily-submission HTTP response contract exists today.
3. **Actor consistency design:** approve the service-contract change to resolve the actor inside the read transaction with a session-aware resolver. This is the recommended technical design and changes current function inputs, so it should be accepted before Stage 1 implementation.

No implementation decision should be inferred from this planning report alone.

## 7. Stage 1 prerequisites

Before Stage 1 begins:

- Record approval for the three decisions above.
- Keep every controller at 501 until a specific endpoint-stage implementation is authorized.
- Design the session-aware actor resolver and offline fakes; require a session for read authorization and preserve no-fallback behavior.
- Establish a clock capture point stable across transaction callback retries and reporting-date rollover.
- Implement strict query validation, not just `Number()` conversion; reject arrays, duplicate keys, unknown keys, whitespace/sign/decimal/exponent encodings.
- Wrap async route handlers for Express 4 rejection forwarding.
- Add endpoint-to-service mapping tests in `test/daily-submissions-api.test.js`, in addition to existing service tests.
- Continue to keep integration execution separate; this Stage 0 review made no live database verification.

## 8. Files likely to change in later phases

- `src/services/submissionAccessService.js` — session-aware read actor loader (without changing POST behavior unless separately approved).
- `src/services/dailySubmissionReadService.js` — transaction-context actor resolution, inactive historical cutoff, stable clock boundary.
- `src/controllers/dailySubmissionController.js` — injected read-service calls, strict parameter mapping, response envelope, async behavior; preserve 501 defaults.
- `src/routes/dailySubmissionRoutes.js` — async wrappers and future employee/organization routes with correct ordering; keep current role restrictions.
- `test/daily-submissions-api.test.js` — HTTP contract, identity, role, query validation, async rejection and route ordering tests.
- `test/daily-submission-read-service.test.js` — service-level inactive date policy, actor session, transaction retry, and unchanged integrity behavior.
- `test/submission-read-access-service.test.js` — only if helper contract changes.
- `test/read-transaction.test.js` — session propagation/retry assertions if runner behavior changes.
- `test/submission-access-grant-service.test.js` — session/user consistency coverage if grant behavior changes.

No MongoDB schema or package change is indicated by this plan.

## 9. Readiness assessment

**Requires Stage 0 approval before implementation; then ready for controlled Stage 1 work.** Existing service authorization and transaction foundations are strong enough for staged integration, but current inactive-member behavior is broader than the confirmed historical-only policy, actor state is outside the transaction snapshot, and no successful HTTP envelope is defined. The proposed decisions address those gaps without enabling an endpoint. Detail record authorization must remain service-enforced and must not be considered covered by current 501 HTTP tests.

## 10. Safety and scope confirmation

Inspected the requested read routes/controller/services, authentication and actor loaders, access/grant/transaction helpers, relevant User/ExpectedSubmission/MetricSubmission/assignment/grant models, reporting-date utility, and explicitly named offline tests. This was static inspection only. No tests were run. No source files, database, integration database, production server, `.env`, `submission_corrections`, Google Sheets, email, scheduler, or other external integration was modified or accessed.
