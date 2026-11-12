# Phase 3B — Daily Metrics Submission API Implementation Plan

**Project:** Automated Accountability System with Real-Time PM Alerts  
**Stage:** Phase 3B, Stage 1 — read-only architecture inspection and planning  
**Date:** 2026-11-11  
**Status:** Planning only; no API implementation started

## 1. Executive Summary

The repository has JWT authentication, role checks, a legacy Google Sheets metrics API, and the Phase 3A submission models. It has no Mongo-backed daily submission route or frontend caller. Existing /api/metrics/user and /api/metrics/all consumers are ticket analytics; they must remain unchanged.

Phase 3B should add a new /api/daily-submissions API and service layer. The API should take employee identity from the authenticated database user, require an independently created ExpectedSubmission row, use that row's stored deadline and policyVersion, capture server time once, classify with the existing deadline utility, and persist a MetricSubmission plus its ExpectedSubmission link consistently. The unique employeeId/reportingDate index is the final duplicate guard. Reads should derive only the caller's own identity or a backend-verified manager scope.

A sequencing dependency remains: Phase 3A created models but did not create a SubmissionPolicy record, activate/assign employees, or generate ExpectedSubmission rows. Phase 3B can be developed and tested with isolated fixtures, but production submission must remain unavailable until an authorized policy/roster is configured and expected-day generation exists. Creating expected rows only when employees submit would make non-submitters invisible.

The plan preserves legacy route contracts, ticket sheets, ticket analytics and alerts. Phase 3B adds a separate route mount and uses MongoDB only. It does not include schedulers, notifications, correction APIs, Sheets sync or frontend work.

## 2. Existing Architecture Findings

| Area | Verified current state | Phase 3B implication |
|---|---|---|
| Express initialization | finalyear-backend/src/server.js creates Express, mounts routers and defines an inline global error handler. Existing mounts include /api/metrics and /api/tickets (lines 88–102). | Add /api/daily-submissions separately. Keep existing route meanings unchanged. |
| DB startup | finalyear-backend/src/config/db.js calls mongoose.connect with autoIndex:true (lines 18–27). server.js starts connection in an async IIFE and invokes startServer separately (server.js:29–36 and 165 onward). | New handlers need a DB-readiness guard/503. Decide whether to sequence listen after connect; a broad startup change risks unrelated routes. |
| Middleware | finalyear-backend/src/middleware/auth.js exports authMiddleware and authorizeRoles. roleAuth.js has equivalent role-only helpers. | Reuse JWT auth; role-only checks do not enforce Team Lead data scope. |
| Controllers/services | Several route files contain inline handlers; ticketRoutes.js writes directly to Sheets. | Keep daily submission logic in a focused controller and service, not in ticket or legacy metrics routes. |
| Error/response style | Existing handlers mix {message}, {success,message}, and direct JSON. server.js maps Mongoose ValidationError to 400 and otherwise err.status or 500 (lines 112–135). No E11000 handling was found. | Define a consistent new API envelope and explicitly map validation, duplicate, auth, scope, missing schedule and DB unavailable errors. |
| Logs | server.js request logger runs before express.json, so req.body is not parsed there; auth.js logs decoded JWT claims and full req.user. | New handlers should not log metrics/remarks or full records. Shared auth logging is a privacy concern for later review. |

Backend dependencies include Express 4.18.3 and Mongoose 8.1.0 (finalyear-backend/package.json).

## 3. Authentication and Authorization Findings

- Login in finalyear-backend/src/routes/authRoutes.js:22–100 signs a one-day JWT with id equal to User._id.toString() (lines 76–89).
- finalyear-backend/src/middleware/auth.js verifies the token, reloads User by decoded.id and refreshes current role/email/name (lines 14–33). The identifier is available as req.user.id from the token; req.user._id is not explicitly assigned.
- authorizeRoles and roleAuth.js validate role only. They do not establish team membership.
- finalyear-backend/src/models/User.js has active, teamId, managerId and employment dates from Phase 3A, all defaulting to false/null for unassigned accounts. No employee/team assignments were made. authMiddleware selects only email, role and name, so roster fields are not on req.user.
- finalyear-backend/src/routes/userRoutes.js:24–46 returns all team_member users to any authenticated caller, without active/team scoping. Do not use it as an authorization source.
- Team Lead access should fail closed until mappings exist. Recommended scope: load current Team Lead and target employee, require matching non-null teamId and target.managerId equal to authenticated Team Lead User._id. Do not trust client-supplied IDs.
- Team Member routes use req.user.id only. PM organization-wide access may be granted by role in this single-project application, but no organization/tenant field exists; confirm role-only scope before implementation.
- User.active defaults false. No live user records were inspected or changed, so initial employee accounts must be explicitly roster-reviewed/activated before enabling submissions.

## 4. Phase 3A Model and Utility Compatibility

| Component | Verified current contract | Phase 3B usage |
|---|---|---|
| MetricSubmission | finalyear-backend/src/models/MetricSubmission.js stores employeeId, ISO reportingDate, actual time, deadline, On-Time/Late, KPI object and policyVersion. It declares unique employeeId/reportingDate (lines 70–80). No idempotency field exists. | Build fields server-side. Reject employeeId, timestamp, deadline, status and policyVersion from body. Catch duplicate-key errors. |
| ExpectedSubmission | finalyear-backend/src/models/ExpectedSubmission.js has the unique employee/date index and Phase 3A.1 status/reference hook (lines 51–84). It validates presence/cast shape, not target-document existence. | Require matching row, same employee/date, expected=true, and non-Excluded state. Persist the matching submissionId with On-Time/Late state consistently. |
| SubmissionPolicy | Versioned deadline/timezone/effective dates/weekdays; no policy document was seeded. | Use ExpectedSubmission.deadlineAt and policyVersion as the policy snapshot; do not recompute an old employee-day from a newly active policy. |
| SubmissionException | Supports employee-specific exceptions and global holidays; approved/date/employee scoping helper exists. | Treat ExpectedSubmission as eligibility authority; do not broaden exceptions inside API. |
| SubmissionCorrection | Preserves original time/deadline/status and immutable correction fields; role check queries User during approval validation (SubmissionCorrection.js:68–90). | No correction API in Phase 3B. Changed resubmissions are conflicts, not implicit corrections. |
| SubmissionAlert | Has delivery lifecycle and idempotency index. | Alert generation/delivery remains separate; do not send or create alerts in this phase. |
| reportingDate.js | Strict normalized YYYY-MM-DD and HH:mm validation. | Accept ISO date-only values, not legacy MM/DD/YYYY parsing. |
| submissionPolicyService.js | Resolves policy, converts IANA wall times, rejects DST gaps/folds, compares equality as On-Time, supports injectable clock and scoped exception helper. | Use classifySubmission(serverNow, expected.deadlineAt), preserving the expected row’s deadline snapshot. |

**Dependency:** no policy seed or expected-day generator exists. Do not create ExpectedSubmission only on submit; it would fail to represent employees who never submit.

## 5. Legacy Metrics API Compatibility

- POST /api/metrics/submit is mounted in finalyear-backend/src/server.js:91 and defined in finalyear-backend/src/routes/metricsRoutes.js:274–360. It applies a hard-coded email allowlist and legacy date middleware, appends an A:I row to a user-named tab in GOOGLE_SPREADSHEET_ID, logs afterward and responds 201 with legacy fields.
- PUT /api/metrics/update is in metricsRoutes.js:95–226. It finds the same A:I layout by date and overwrites a matching row; missing row returns 404. Neither route is Mongo accountability.
- Search found no frontend call to POST /api/metrics/submit or PUT /api/metrics/update. Frontend components call /api/metrics/user and /api/metrics/all for ticket analytics. External scripts/clients are unknown.
- Keep legacy behavior/target intact. Add a separate router and path; do not repurpose, redirect or merge ticket or metrics spreadsheet writes.
- Compatibility risk: both APIs sound like metrics submission but have different body, persistence and meaning. Document the new path separately. Deprecate legacy routes only after caller inventory and approval.

## 6. Proposed Endpoint Contracts

All endpoints use Bearer JWT, derive caller identity from req.user.id and use Asia/Kolkata ISO reporting dates. Strictly allowlist request fields.

### 6.1 Submit daily metrics

**POST /api/daily-submissions** — team_member role.

Request:

~~~json
{
  "reportingDate": "2026-11-11",
  "metrics": {
    "ticketsAssigned": 5,
    "ticketsResolved": 4,
    "slaBreaches": 0,
    "reopenedTickets": 1,
    "clientInteractions": 3,
    "remarks": "Daily summary"
  }
}
~~~

No employeeId, actualSubmittedAt, deadline, status, policyVersion or sheet name is accepted. Server obtains matching ExpectedSubmission and its deadline/policy snapshot, captures server time once, classifies, inserts MetricSubmission, then links ExpectedSubmission.

Success 201:

~~~json
{
  "success": true,
  "submission": {
    "id": "submission-id",
    "employeeId": "authenticated-user-id",
    "reportingDate": "2026-11-11",
    "actualSubmittedAt": "2026-11-11T03:59:00.000Z",
    "applicableDeadlineAt": "2026-11-11T04:00:00.000Z",
    "status": "On-Time",
    "policyVersion": "v1",
    "metrics": {
      "ticketsAssigned": 5,
      "ticketsResolved": 4,
      "slaBreaches": 0,
      "reopenedTickets": 1,
      "clientInteractions": 3,
      "remarks": "Daily summary"
    }
  }
}
~~~

Validate strict date, existing expected row for same employee/date, expected=true, Pending or Missing state, approved date window, integer counts >= 0 and remarks <= 1000 characters. Exactly deadline is On-Time; after it is Late and accepted. Excluded or already-submitted rows are rejected.

### 6.2 Retrieve own day

**GET /api/daily-submissions/me/:reportingDate** — any supported authenticated role, own record only. Return expected status/deadline/reason and nullable submission. Missing/Pending can exist without MetricSubmission. If no expected row exists, return stable EXPECTED_DAY_NOT_FOUND; do not fabricate Pending.

### 6.3 Retrieve current business-day status

**GET /api/daily-submissions/me/current** — own current IST reporting date. Resolve date with an explicit timezone-aware server utility and current policy, then return the own-day response. Requires policy and expected-day generation.

### 6.4 Retrieve employee history

**GET /api/daily-submissions/me/history?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=25** — own history only. Query ExpectedSubmission by req.user.id and bounded dates, join MetricSubmission where present, sort newest first, paginate with max limit 100. This includes Missing/Pending/Excluded context, not only actual submissions. Validate from <= to and range bounds.

### 6.5 Manager detail

**GET /api/daily-submissions/:submissionId** — owner, Team Lead in verified scope, authorized PM. Validate ObjectId, fetch the record and enforce scope before returning. Include linked expected state and only accountability-required fields. Choose consistent 404/403 behavior for inaccessible IDs and test it. No team overview or correction route is proposed in this stage.

## 7. Server Validation and Duplicate Semantics

POST validation should proceed in this order:

1. Authenticate through existing JWT middleware; require team_member role and active=true. All identity comes from the current User record.
2. Accept only reportingDate and metrics. Reject extra keys such as employeeId, actualSubmittedAt, deadline, status, policyVersion or sheet/tab name.
3. Parse exact YYYY-MM-DD using reportingDate helper; reject impossible, future or disallowed dates.
4. Find ExpectedSubmission by authenticated User._id and reportingDate. If missing, return EXPECTED_DAY_NOT_FOUND; do not create an expected row. Require expected=true, no exception exclusion, and status Pending or Missing.
5. Verify employeeId/date match, submissionId is null, deadlineAt is a valid date and policyVersion is present. Use that saved deadline snapshot.
6. Require each count as a nonnegative integer and remarks as a string no longer than 1000 characters.
7. Capture server time once through the injectable clock. Classify On-Time when actualSubmittedAt <= deadlineAt; otherwise Late. Reject or ignore client-supplied status/time.
8. Persist MetricSubmission and the ExpectedSubmission status/reference consistently.

The MetricSubmission model has no persisted idempotency-key field. The baseline duplicate behavior should use the unique employee/date index. On duplicate-key error, read the canonical record: if normalized KPI values equal the request, return 200 with existing result and replayed=true; if they differ, return 409 ALREADY_SUBMITTED. Never overwrite on retry; corrections require a later approved correction flow. A durable Idempotency-Key contract would require an approved model/schema addition.

## 8. Database Consistency and Transaction Strategy

Mongoose 8.1 supports sessions/withTransaction, but no transaction usage exists in source. Deployment topology is unknown because no database was accessed. Mongo multi-document transactions require a replica set or sharded deployment.

**Preferred strategy:** confirm transaction support, then in one transaction re-read and conditionally claim the ExpectedSubmission (expected=true, Pending/Missing, submissionId=null), insert MetricSubmission under unique employee/date, and set ExpectedSubmission to On-Time/Late with submissionId and statusEvaluatedAt. Validate employee/date on both records before commit. Unique index handles concurrent POSTs; transaction rolls back either write if the other fails.

**If transactions are unavailable:** stop and approve a consistency alternative before implementation. Two writes can leave an unlinked submission if the process stops between them. Options include a durable reconciliation/outbox or one authoritative write with a reviewed derived-state strategy; do not claim atomicity or depend on the not-yet-built Phase 3C scheduler to hide partial state.

The db config sets autoIndex:true and schema indexes exist, but actual indexes were not verified. Before rollout, an isolated test database should await model index initialization and exercise unique and concurrent inserts. Mongo duplicate error code 11000 must be mapped explicitly; it currently falls through the global handler. No index build or migration is part of this plan.

## 9. Authorization and Read Semantics

- Team Member: submit and read only own employeeId. Add req.user.id directly to the database predicate; do not accept employeeId query/body fields.
- Team Lead: load Team Lead and submission owner from Mongo and require a configured direct managerId relationship plus matching non-null teamId. Missing mappings deny access.
- Project Manager: organization-wide detail only if the owner confirms the role is the scope boundary. There is no organization/tenant field.
- Apply authorization before returning fields. Choose consistent inaccessible-ID behavior (404 concealment or 403) and test it.
- History should query ExpectedSubmission by caller ID, then retrieve referenced MetricSubmission records; do not scan all submissions then filter in memory.
- Inactive users cannot submit. Whether they can see their own historical records is an open policy decision.

## 10. Error Handling and Security

Use a stable new API response shape such as {success:false,error:{code,message}}.

| Condition | HTTP | Suggested code |
|---|---:|---|
| Missing or invalid JWT | 401 | UNAUTHENTICATED |
| Wrong role, inactive account, or out-of-scope manager | 403 (or detail 404) | FORBIDDEN |
| Invalid date, body, metric or ObjectId | 400 | INVALID_REQUEST |
| Own requested record absent | 404 | SUBMISSION_NOT_FOUND |
| Expected row absent for POST | 409 | EXPECTED_DAY_NOT_FOUND |
| Excluded/nonworking date or closed window | 422 | NOT_ELIGIBLE |
| Duplicate with changed metrics | 409 | ALREADY_SUBMITTED |
| Mongo unavailable | 503 | SUBMISSION_STORE_UNAVAILABLE |
| Unexpected error | 500 | INTERNAL_ERROR |

Map Mongoose ValidationError/CastError to 400 and duplicate-key 11000 to duplicate handling. For transient transaction errors, return a retryable response only if abort is known; if commit outcome is uncertain, query by unique employee/date first. Never return stack traces, raw Mongoose errors, allowlists, JWT claims or database configuration.

Use a strict body allowlist, server-owned identity/time/status, role and team authorization in backend queries, bounded date ranges/pagination and remarks. Do not use ticket dates, event logs or spreadsheet modification times as submission evidence. New route handlers must not log remarks or full records. Existing auth middleware currently logs token claims and req.user; note this as a separate shared logging hardening issue rather than expanding Phase 3B unexpectedly.

## 11. Expected Implementation Files

**Create**

- finalyear-backend/src/routes/dailySubmissionRoutes.js — route declarations, auth and request validation.
- finalyear-backend/src/controllers/dailySubmissionController.js — translate service results into HTTP responses.
- finalyear-backend/src/services/dailySubmissionService.js — eligibility, timestamp/status, writes, duplicate replay and own-history/detail queries.
- finalyear-backend/src/services/submissionAccessService.js — current actor and owner/Team Lead/PM scope checks from User records.
- finalyear-backend/test/daily-submissions-api.test.js — API/service tests and isolated database integration tests where available.

**Modify**

- finalyear-backend/src/server.js — add the new router mount only.
- finalyear-backend/src/middleware/auth.js — not required for the baseline; service can query roster fields by req.user.id. Any additive req.user fields need regression tests.
- finalyear-backend/src/models/MetricSubmission.js — no change for baseline duplicate comparison; modify only if persisted idempotency key is separately approved.
- finalyear-backend/src/services/submissionPolicyService.js — optionally add an IST current-reporting-date helper if kept outside the submission service.

Do not modify metricsRoutes.js, ticket routes/models/services, frontend, schedulers, alerts, email, Google Sheets or package manifests.

## 12. Testing Strategy

The backend package has no test script or dedicated test framework. Phase 3A uses Node's built-in node:test; continue without dependency installation. No Supertest dependency was found. If an HTTP test library is needed, seek approval first; alternatively exercise the controller/service and built-in HTTP interfaces.

**Unit cases:** strict body allowlist; ISO dates; all KPI bounds; timestamp/status spoof attempts; saved expected policy snapshot; exact deadline/before/after; inactive user; missing expected record; excluded day; employee/date mismatch; self-only history; unauthorized detail; duplicate same-value replay; duplicate changed-value conflict; stable HTTP error mapping.

**Isolated Mongo integration cases:** transaction commit/rollback; cross-document employee/date match; expected/submission relation; unique index build; concurrent same-date POST; transaction unsupported behavior; team/PM read scope. Use only a dedicated test replica set/database; no production connection. No database tests were run during this read-only planning stage.

**Regression cases:** old /api/metrics/submit and /update contracts remain; /api/metrics/user and /all continue ticket analytics; /api/tickets routes remain on existing ticket data. No email, Sheets or scheduler work belongs in these tests.

## 13. Dependencies and Unresolved Decisions

| Decision | Why it matters | Recommended default |
|---|---|---|
| How will policy and ExpectedSubmission rows be provisioned? | No policy seed or expected-day generator exists. | Require rows; don't make submit the source of its own expected status. Keep production API disabled until provisioning is ready. |
| Which current employees are active and how are teams/managers mapped? | User defaults inactive/null; safe access cannot be inferred. | Obtain authorized roster mapping; never invent it. |
| Does Mongo support transactions? | Cross-document write consistency depends on topology. | Confirm replica set/sharding before coding; otherwise approve alternative consistency model. |
| Duplicate replay semantics? | Model has no request key. | Same employee/date and same normalized values returns existing result; changed values return 409. |
| Which past dates may be submitted? | Existing API has separate role-specific date rules; new rule lacks backfill window. | Require an open expected row; decide if late entry is accepted after midnight. |
| Does PM role alone grant organization scope? | No organization/tenant model exists. | Confirm single-project role boundary before enabling detail access. |
| Response for absent expected day? | Must not display false Pending. | Return EXPECTED_DAY_NOT_FOUND. |
| Can deactivated employees read history? | Active is new and no policy covers historical access. | Decide explicitly; preserve history but authorize access. |
| Corrections in submit endpoint? | Correction model exists, but no correction API. | No; changed metrics conflict and wait for an approved correction phase. |
| Server readiness? | Express may listen while DB connect is pending. | New API returns 503 until Mongo is ready; broad startup refactor separate. |

## 14. Staged Phase 3B Roadmap

1. **3B.1 Route/readiness foundation:** new router/controller/service boundaries, route mount, auth, strict validation and stable errors; verify legacy paths unchanged.
2. **3B.2 Submission write:** require expected row, capture server instant, classify against stored deadline, persist and link transactionally, handle duplicates. Resolve Mongo topology and expected-row prerequisite first.
3. **3B.3 Own reads:** current day, reporting-date status and bounded history, with no fabricated state when expected row is absent.
4. **3B.4 Manager details:** Team Lead scope and PM scope only after roster/organization permissions are confirmed.
5. **3B.5 Verification:** isolated service/API tests, replica-set integration/concurrency tests, old route contract checks and test-environment smoke test.

Each stage is separately reviewable. No frontend, expected-day scheduler, alerts/email, ticket modification, Sheets sync or Power BI is included.

## 15. Main Risks

- Missing policy and expected-day generation prevents real submission eligibility checks.
- Null/inactive User roster fields prevent safe employee activation and Team Lead scoping.
- Unique indexes are declared and autoIndex is enabled, but actual index creation was not verified.
- Transactions are unused and deployment topology is unknown.
- Server may listen before Mongo connection completes.
- No frontend caller does not rule out external legacy API clients.
- Auth logs contain token/user claims; new route must not add private metrics to logs.
- ExpectedSubmission checks reference presence, not target document existence; service/transaction must verify exact employee/date.
- Never infer submission time/status from tickets, event logs, Sheets timestamps or legacy A:I rows.

## 16. Phase Gate

This document is the read-only implementation plan. No source, test, configuration, database, spreadsheet, email or ticket workflow was modified. No DB connection, tests, API calls, migration or external operation was performed.

**Phase 3B APIs remain unimplemented. Wait for explicit approval before implementation.**
