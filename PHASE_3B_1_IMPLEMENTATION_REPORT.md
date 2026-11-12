# Phase 3B.1 Implementation Report

## Scope

Implemented the route and service foundation for daily metric submissions only. This phase does not enable submission creation or database-backed reads. The `POST /api/daily-submissions` endpoint validates and authorizes the request, then deliberately returns `501 NOT_IMPLEMENTED`.

## Files inspected

- `finalyear-backend/src/server.js` — existing route mounts and global error handler.
- `finalyear-backend/src/config/db.js` — existing MongoDB readiness behavior; not changed and not invoked by tests.
- `finalyear-backend/src/middleware/auth.js` — existing JWT verification, current-user lookup and role authorization.
- `finalyear-backend/src/models/User.js` — authenticated identity and optional roster metadata.
- `finalyear-backend/src/models/MetricSubmission.js` — submission model from Phase 3A; not written by this phase.
- `finalyear-backend/src/models/ExpectedSubmission.js` — expected-day model from Phase 3A; not written by this phase.
- `finalyear-backend/src/utils/reportingDate.js` — reporting-date validation.
- `finalyear-backend/src/services/submissionPolicyService.js` — policy and deadline foundation; not changed by this phase.
- `finalyear-backend/src/routes/metricsRoutes.js` and `finalyear-backend/src/routes/ticketRoutes.js` — existing legacy routes; not changed.
- `finalyear-backend/test/submission-foundation.test.js` — existing offline foundation suite.
- `finalyear-backend/package.json` — confirmed existing runtime/test dependencies; not changed.

## Files created or modified

- `finalyear-backend/src/services/dailySubmissionService.js` — standard API errors, current reporting-date and payload validation, ID validation, and a store-readiness guard.
- `finalyear-backend/src/services/submissionAccessService.js` — current User roster loading and fail-closed Team Member, Team Lead and Project Manager scope checks.
- `finalyear-backend/src/controllers/dailySubmissionController.js` — explicit `501 NOT_IMPLEMENTED` responses for write/read handlers.
- `finalyear-backend/src/routes/dailySubmissionRoutes.js` — isolated route definitions and middleware composition.
- `finalyear-backend/src/middleware/auth.js` — preserves legacy auth response bodies and emits the standard `{ success, error }` envelope only for the new router.
- `finalyear-backend/src/server.js` — mounts `/api/daily-submissions` separately and formats its errors without changing other route error handling.
- `finalyear-backend/test/daily-submissions-api.test.js` — offline route, auth, validation, date, readiness and access-scope tests.
- `PHASE_3B_1_IMPLEMENTATION_REPORT.md` — this report.

## Implemented behavior

The router is mounted at `/api/daily-submissions` with these endpoints:

- `POST /` — role-gated to `team_member`; validates a current `Asia/Kolkata` reporting date and the supported metric fields, derives identity from the authenticated user, reloads current roster status, rejects inactive users, then returns `501 NOT_IMPLEMENTED`.
- `GET /me/history`
- `GET /me/current`
- `GET /me/:reportingDate`
- `GET /:submissionId`

The four GET handlers are registered and role-gated for `team_member`, `team_lead` and `project_manager`, but deliberately return `501 NOT_IMPLEMENTED`. The detail route rejects malformed IDs before reaching that handler.

The payload accepts only `reportingDate` and `metrics`. It rejects client-supplied identity or status fields, unsupported metric keys, non-integer or negative counts, invalid dates, and dates other than the current reporting date. The date is derived using an injected server clock and the explicit `Asia/Kolkata` timezone.

The readiness middleware returns a standard 503 response before JWT verification when the submission store is unavailable. Authorization uses the existing JWT middleware and fresh User role data. Team Member submission access checks the current active flag. Team Lead scope requires an active lead and employee, a matching non-empty team ID, and a manager link from the employee to that lead. Team Lead's own manager relationship is not treated as a scope restriction. Project Manager organization-wide access remains fail-closed unless explicitly authorized by a future verified policy.

## Tests added and results

Added 10 offline tests covering:

- Route registration for one POST and four GET operations.
- Reporting-date behavior across host timezone settings.
- Current-day, malformed-date, unsupported identity-field and metric-value validation.
- Store readiness before authentication.
- Missing/invalid JWT responses and role denial.
- Active-user validation and the explicitly disabled POST response.
- Invalid submission IDs.
- Authenticated user identity mapping and Team Lead/Project Manager scope checks.

Execution results:

- `node --test finalyear-backend/test/daily-submissions-api.test.js` — **10 passed, 0 failed**.
- `node --test finalyear-backend/test/submission-foundation.test.js` — **26 passed, 0 failed**.
- Total executed — **36 passed, 0 failed**.

The route tests use a temporary loopback HTTP server and mocked User lookup. The two targeted suites did not connect to MongoDB.

A subsequent broad `node --test` discovery attempt also picked up legacy integration scripts in this backend. Its output showed that the email test scripts sent test messages and the Sheets configuration test accessed the configured spreadsheet. One additional test script failed because `google.spreadsheetId` was not configured, and another email script reported a post-send test-helper error. These integration scripts were outside the intended offline verification; no files were modified by this attempt. The broad command completed its discovery run and will not be repeated.

## Remaining limitations and Phase 3B.2 prerequisites

- Submission creation is not implemented; every valid POST receives 501.
- All four reads are not implemented; each receives 501.
- No expected-day generation, expected record mutation, submission persistence, transaction, correction flow, alert, scheduler, email, Google Sheets, or frontend work was added.
- Existing User records default to inactive and may have no team/manager assignment. Real roster setup and authorization policy must be established before enabling submission or team-wide reads.
- Project Manager organization-wide scope requires an explicit, verified authorization policy before it can be enabled.
- MongoDB transaction support and deployment topology were not verified because this phase did not connect to a database.
- The new APIs are not yet integrated with the legacy Google Sheets metrics workflow.

## Safety confirmation

No MongoDB connection was opened and no submission or expected-day database writes were introduced. The broad test discovery attempt did make the external email and Sheets test calls described above; therefore this phase cannot claim that no external systems were contacted or changed. No source configuration or email workflow files were modified by the implementation. The Sheets test output only reported access and metadata reads; I have no evidence it changed spreadsheet content. Existing ticket models, routes, services and alerts; Google Sheets and email workflows; frontend components; schedulers; environment files; and dependency manifests were not modified by this phase. Phase 3B.2 has not been started.