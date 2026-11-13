# Stage 0 Final Authorization and Stage 1 Plan

**Project:** Automated Accountability System with Real-Time PM Alerts  
**Phase:** 3B.7.9 — Final Stage 0 Authorization and Stage 1 Implementation Plan  
**Document type:** Approved decision record and implementation plan  
**Date:** 2026-11-14  
**Repository:** `D:\Automated Accountability System\finalyear-backend`

## 1. Stage 0 closure record

The following Stage 0 decisions are approved by the user and final for subsequent implementation planning. This document records and closes Stage 0 without rewriting the original planning history in `DAILY_SUBMISSION_STAGE_0_DECISIONS.md`.

### Decision A — Inactive Team Member access

Inactive Team Members retain read-only access only to their own historical daily-submission records. Historical means a reporting date strictly earlier than the current reporting date in `Asia/Kolkata`.

- Active Team Members may read their own current and historical records.
- Inactive Team Members may read their own past reporting dates only.
- An inactive member cannot use `/me/current`.
- An inactive member cannot request today or a future date through `/me/:reportingDate`.
- An inactive member cannot request history where `toDate` is today or later. Reject an overlapping interval; do not filter it into a partial response.
- An inactive member cannot read own current-day or future submission detail.
- Inactive Team Members cannot create submissions.
- Team Leads and Project Managers must be active for privileged reads. Inactive privileged actors cannot use their role to access another employee’s or organization’s data.
- Team Member ownership is based on authenticated User ID and must not depend on current team/manager roster membership.
- Capture one clock instant per logical request and preserve its reporting-date cutoff across transaction callback retries.

### Decision B — Successful HTTP response

Successful GET operations return HTTP 200 with:

```json
{ "success": true, "data": result }
```

`data` contains the existing read-service result shape. Controllers must return explicitly shaped data and must not expose raw Mongoose documents or internal model fields. Existing error envelope structure remains unchanged.

### Decision C — Actor resolution in the read transaction

Use a session-aware actor resolver inside the existing `runReadTransaction()` callback.

- The controller supplies only the authenticated User ID from the verified JWT identity.
- The read operation resolves persisted User role, active state, and required roster/employment fields using the callback’s MongoDB session.
- The resolver verifies the actor exists and the loaded actor ID matches the authenticated ID.
- Role and active decisions use persisted User fields, never JWT role/active claims or client-provided actor data.
- Actor, assignment/grant, ExpectedSubmission, MetricSubmission, and related count reads use the same transaction session.
- The resolver is read-only and safe to rerun when `withTransaction()` retries the callback. It uses the same authenticated ID and that callback’s session on every attempt.
- No nontransactional fallback is allowed. A missing User is not an authorized actor.
- Preserve POST’s existing actor-loading behavior; this transaction-aware design applies to GET read operations.

**Stage 0 status: CLOSED.** The three prior Stage 0 approval items are no longer unresolved. This closure does not authorize implementation or endpoint activation.

## 2. Stage 1 objective and scope

Stage 1 prepares the existing Team Member self-service GET operations for service integration:

| Existing route | Read-service operation |
|---|---|
| `GET /me/current` | `getOwnCurrent` |
| `GET /me/:reportingDate` | `getOwnDay` |
| `GET /me/history` | `getOwnHistory` |

All remain Team Member-only. No employee, organization, or new detail routes are part of Stage 1. Do not change or enable POST. The approved cutoff for inactive-member detail is recorded for Stage 2; Stage 1 must not accidentally enable or alter the detail endpoint.

**Disabled-by-default requirement:** implementation may prepare injected handlers for isolated tests, but default production router/controller construction must keep all GET and POST handlers at 501 until a separate activation decision. Merely completing Stage 1 or passing tests is not activation approval.

## 3. Current implementation findings relevant to Stage 1

### Actor loading and transaction

`authMiddleware` verifies the JWT and reads a persisted User role for its outer route gate (`src/middleware/auth.js:36-80`). `loadSubmissionActor()` currently reads role, active, team, manager, and employment dates but has no session option (`src/services/submissionAccessService.js:12-34`). Current read-service functions receive an `actor` before entering their transaction; `runReadTransaction()` then starts the session and executes the callback (`src/services/dailySubmissionReadService.js:159-185`, `readTransaction.js:14-52`). Thus reporting data and assignment/grant checks share a snapshot, but User actor state does not yet share it.

### Inactive self-read behavior

Current `getOwnDay`, `getOwnCurrent`, `getOwnHistory`, and `getSubmissionDetail` authorize Team Member ownership without checking `actor.active`. Consequently an inactive member can presently retrieve own current-day and future records if present, and history ranges that include today. This is broader than Decision A and requires service-level change before these reads are enabled. `getOwnCurrent` currently derives the reporting date inside the transaction callback; because the callback may retry, Stage 1 must capture the clock instant once before retry and reuse the derived date/cutoff.

### Existing disabled HTTP boundary

`src/controllers/dailySubmissionController.js` returns 501 for every current controller method. `/me/*` role gates already allow only `team_member`; GET handlers are currently direct synchronous controller references. `asyncRoute()` exists and is used by POST only (`src/routes/dailySubmissionRoutes.js:17, 38-64`). A controller that awaits the read service must be mounted through `asyncRoute()` or equivalent rejection forwarding for Express 4.

## 4. Stage 1 design

### Workstream 1 — Session-aware read actor resolver

Add a read-specific session-aware resolver in `src/services/submissionAccessService.js`, or extend the existing loader in a way that preserves the existing POST call behavior.

Recommended shape:

- Inputs: authenticated User ID, required transaction session, injected `UserModel` (default production User model).
- Query: `UserModel.findById(authenticatedUserId).select("_id role active teamId managerId employmentStartDate employmentEndDate").session(session).lean()`.
- Reject invalid authenticated IDs before model access.
- Missing User returns the established 401 `UNAUTHENTICATED` error.
- Normalize actor ID and verify it equals the authenticated lookup ID.
- Return only the actor fields already needed by service authorization.
- For the read path, missing session is an error; do not call the model without `.session()` and do not retry outside the transaction.
- Keep the existing POST actor loader behavior unchanged. If a shared helper is extended, make session use explicit and preserve the existing POST path without altering its error/policy behavior.

The read service should invoke this resolver from inside each transaction callback, before the ExpectedSubmission/MetricSubmission reads. The same callback session must be passed to actor, assignment/grant, record, and count queries. The User lookup must run again on each transaction callback retry, with the identical authenticated ID and the attempt’s session. The captured clock instant must remain outside the retry callback so retries cannot move the inactive-member date boundary.

Offline test injection should provide a fake User model/query, fake transaction runner, and identifiable session objects. Avoid importing the server or connecting to MongoDB.

### Workstream 2 — Enforce the inactive historical cutoff in the read service

Apply the approved policy in service code, not only route/controller code, so direct service calls cannot bypass it.

- **`getOwnCurrent`:** resolve actor inside transaction, require Team Member role and `active === true`, then use the reporting date derived from the one captured request instant.
- **`getOwnDay`:** validate the date first; resolve actor in transaction; enforce Team Member role and self-ownership. For inactive actors require `reportingDate < currentReportingDate`; reject today/future with 403 `ACCOUNT_INACTIVE`. Active members retain existing self-service behavior.
- **`getOwnHistory`:** validate date range and pagination; resolve actor in transaction; enforce Team Member role and self-ownership. For inactive actors require `toDate < currentReportingDate`; reject ranges overlapping today/future with 403 `ACCOUNT_INACTIVE`. Do not silently clip results.
- **Stage 2 detail note:** `getSubmissionDetail` must later apply the same inactive cutoff using record metadata before returning the detail data. Do not wire or change detail in Stage 1.
- Preserve the existing read helper behavior that Team Member ownership does not depend on current roster membership.
- Keep Team Lead and Project Manager checks separate; do not apply their assignment/grant authorization paths to Team Members.
- Preserve all existing ExpectedSubmission/MetricSubmission integrity validation and safe error mapping.

Use one immutable `requestNow`/reporting-date context per logical request. The read service may capture it before calling the transaction runner or receive it from a controller factory clock, but it must not call the clock again from a retryable callback. `getOwnCurrent` and inactive historical cutoff must derive from the same captured instant.

### Workstream 3 — Strict Team Member HTTP input validation

Validate request shape before invoking the read service or opening the read transaction, while retaining service-level validation as defense in depth.

#### `GET /me/current`

- No path parameter.
- No query keys accepted.
- Active Team Member only under Decision A.

#### `GET /me/:reportingDate`

- Exact calendar date string `YYYY-MM-DD`; reject malformed or impossible dates before service reads.
- No query keys accepted.
- Active Team Member can request an existing valid date; inactive Team Member only a date earlier than today IST.

#### `GET /me/history`

- Required: `fromDate`, `toDate`.
- Optional: `page`, `limit`.
- Inclusive date-only range in `Asia/Kolkata`; reject invalid dates and `fromDate > toDate`.
- Defaults: `page=1`, `limit=20`; maximum `limit=100`.
- Reject unknown query keys.
- Reject repeated/array-valued values, empty strings, whitespace, signs, decimal or exponent notation, zero, negative values, and non-integers. Parse only strict scalar base-10 positive integer strings; do not rely on permissive `Number()` conversion alone.
- For inactive actors, reject the whole interval if `toDate >= today IST`.

No Team Member GET accepts employee identity in path, query, body, or headers. Ignore no identity fields as authorization input; reject unsupported query identity keys and always resolve actor ID from the authenticated request identity. Authentication’s own User lookup may occur before route-level validation; the no-database-read assertion applies to the read-service actor resolver and submission data queries after invalid input is rejected.

### Workstream 4 — Controller and route dependency injection

Use narrow testable injection while preserving disabled defaults:

- Controller factory accepts a read-service dependency, a trusted actor resolver dependency, and a clock.
- Router factory accepts a controller set, defaulting to the existing 501 singleton.
- No request may supply or override the read service, actor resolver, clock, models, or transaction runner.
- Controller extracts only `getAuthenticatedUserId(req.user)` and validated route/query values; service resolves fresh actor inside its transaction.
- Map routes exactly to the three operations and pass only contract inputs. `/me/*` never forwards a client employee ID.
- Return HTTP 200 `{success:true,data:result}` on success. Keep the existing standardized error envelope unchanged.
- Mount every Promise-returning handler with `asyncRoute()` (or equivalent `Promise.resolve(handler(...)).catch(next)`). Ensure invalid input and role failures occur before service/model reads wherever the contract permits.
- Preserve current route role gates and keep default production controller stubs at 501. Do not modify unrelated POST behavior.

## 5. Stage 1 test matrix

Run only explicitly named offline suites after implementation is approved. Use mocked models and a fake transaction runner; do not run integration tests.

### Read-service and transaction tests

| Area | Required cases and assertions |
|---|---|
| Actor resolver | Valid User selected fields; exact authenticated ID; session supplied to User query; actor ID mismatch rejected; missing User returns 401; invalid ID rejected before lookup; unsupported persisted role rejected before ExpectedSubmission/MetricSubmission queries. |
| Session consistency | Same session reaches User, ExpectedSubmission, MetricSubmission, and `countDocuments`; relevant access helper queries use that session. No query happens without session. |
| Retry behavior | Fake transaction runner invokes callback more than once; resolver runs once per attempt with the same authenticated ID and that attempt’s session; captured clock is called once and cutoff remains identical; no writes or external side effects occur. |
| Inactive `getOwnCurrent` | Inactive Team Member denied; no ExpectedSubmission/MetricSubmission/count query after actor resolution. Active Team Member current lookup remains valid. |
| Inactive `getOwnDay` | Inactive past date allowed; today and future denied before reporting-data query; active current/past behavior preserved; self-ID mismatch denied. |
| Inactive `getOwnHistory` | Inactive interval ending yesterday allowed; interval ending today or later denied with no ExpectedSubmission find/count; active history and pagination remain intact. |
| Integrity regressions | Preserve all existing timestamp, punctuality, status, reference, policy, deadline, employee/date consistency and orphan-record tests. |

### HTTP tests

| Area | Required cases and assertions |
|---|---|
| Identity and persisted actor | JWT contains synthetic authenticated ID; actor resolver receives only that ID and same transaction session; forged JWT role/active claims ignored; client IDs in query/body/header never become actor or employee IDs. |
| Exact route mapping | `/me/current` calls only `getOwnCurrent`; `/me/:reportingDate` calls `getOwnDay` with validated date; `/me/history` calls `getOwnHistory` with required range and normalized/default pagination. |
| Input rejection | No query keys on current/day; missing history dates; invalid calendar dates; reversed range; unknown keys; repeated/array values; empty/whitespace/sign/decimal/exponent/zero/negative/non-integer page/limit; limit 100 accepted and 101 rejected. Assert no read-service actor resolution or submission query for rejected input. |
| Inactive policy | `/me/current` denied; inactive past day succeeds; inactive today/future denied; inactive history ending yesterday succeeds; history overlapping today denied; active member access preserved. |
| Response/errors | Exact HTTP 200 success envelope; unchanged error envelope and codes; database error details hidden; rejected service promise reaches Express 4 error middleware and becomes safe error response. |
| Disabled state | Default router/controller set still returns 501 for current GET stubs until explicitly injected for tests; POST remains 501 after valid prerequisites; no endpoint activation in this implementation phase. |

The HTTP test harness should inject a fake controller/service for route mapping assertions and separately exercise service behavior with fake models/transactions. Do not treat a 501 response as evidence that a read service authorized a record.

## 6. Proposed Stage 1 files

Expected implementation/test files:

- `src/services/submissionAccessService.js` — session-aware read actor resolver; preserve POST behavior.
- `src/services/dailySubmissionReadService.js` — actor resolution inside transaction for the three Stage 1 functions; clock capture and inactive historical cutoff.
- `src/controllers/dailySubmissionController.js` — injectable read-service calls, validation-to-service mapping, approved success envelope; disabled default remains 501.
- `src/routes/dailySubmissionRoutes.js` — injected controller option, strict self-service route inputs, `asyncRoute()` for Promise-returning GET handlers; current Team Member role gates retained.
- `test/daily-submission-read-service.test.js` — actor/session/retry and inactive date-policy regression coverage.
- `test/daily-submissions-api.test.js` — route mapping, strict validation, identity, response, and async error coverage.
- `test/submission-read-access-service.test.js` — only if shared actor/access helper behavior must change; avoid unrelated privileged-access edits.
- `test/read-transaction.test.js` — extend only if the transaction retry/session behavior changes.

No schema/model, package, `.env`, legacy API, scheduler, alert, email, Sheets, or integration harness changes are expected. If implementation reveals a confirmed dependency that requires one of those files, stop and request separate scope approval.

## 7. Reviewable implementation sequence

1. Implement a read-specific actor resolver that requires a session; add isolated actor/session tests. Preserve the POST loader call path.
2. Add transaction-context actor resolution to `getOwnCurrent`, `getOwnDay`, and `getOwnHistory`; verify all queries use the callback session and actor reloads on retries.
3. Add stable request-clock capture and enforce the approved inactive-member current-vs-historical cutoff in those three service operations.
4. Implement strict Team Member route/query validation and prove malformed inputs do not start read-service operations.
5. Add controller/router dependency injection with disabled-by-default controller behavior; verify exact route-to-service argument mapping and the approved response envelope.
6. Add `asyncRoute()` rejection forwarding for the enabled/test-injected GET handlers and test safe service rejection handling.
7. Complete service and HTTP regression suites; review query/session coverage, response data minimization, and disabled defaults.
8. Conduct a read-only security review and accept Stage 1 implementation as a separate decision.
9. Keep activation as a separate future approval. Do not enable any GET or POST endpoint by completing Stage 1.

## 8. Risks and safeguards

- **Snapshot retry:** actor lookup and service reads may be rerun. Keep the resolver read-only, identity fixed, session explicit, and clock cutoff captured once outside the retry callback.
- **Account-state policy:** only past self-records are available to inactive Team Members. Apply the policy in the service so direct service callers cannot bypass the route.
- **Privilege boundaries:** this stage handles Team Member self-service only. Do not add Team Lead/PM endpoints or reuse their grant/assignment checks as substitutes for self-ownership.
- **HTTP parsing:** Express query parsing may produce arrays for repeated values. Reject non-scalar values and unknown keys before service invocation.
- **Async errors:** Express 4 does not handle rejected promises automatically. Wrap every async route and test the rejection path.
- **Response exposure:** serialize the service’s documented result shape only; never send raw Mongoose documents, User records, password/hash fields, grants, sessions, or internal error details.
- **No activation by testing:** test injection must not change the default production controller/router wiring. Verify 501 defaults remain until a separate activation approval.
- **Database readiness:** do not fall back to independent reads if transactions cannot start. Continue using primary snapshot transaction behavior and `finally` session cleanup.

## 9. Stage 1 readiness assessment

**Ready to begin Stage 1 implementation under the approved decisions.** Stage 0 is closed by the three explicit approvals recorded above. The existing service transaction runner, models, access helpers, and offline injection patterns provide a foundation. Stage 1 must still implement the actor/session resolver, inactive historical cutoff, strict query validation, disabled-by-default injection, Express 4 async forwarding, and the specified regression coverage before implementation acceptance. Endpoint activation remains a separate decision and is not authorized here.

## 10. Safety and scope confirmation

This document is a plan only. Source files were inspected read-only and were not modified. No database or external integration was accessed or modified. No tests were run. No server was started. `.env`, the integration database, `submission_corrections`, Google Sheets, email, schedulers, and alerts were not accessed.

