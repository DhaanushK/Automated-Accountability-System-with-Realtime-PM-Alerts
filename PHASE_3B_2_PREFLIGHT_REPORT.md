# Phase 3B.2 Preflight Report

**Project:** Automated Accountability System with Real-Time PM Alerts  
**Assessment date:** 2026-11-11  
**Scope:** Read-only preflight; no submission writes, database connections, external integration calls, or changes to application source.

## Executive decision

**NO-GO for implementing/enabling the Daily Metrics Submission Write Engine at this time.** The repository has useful foundations, but transaction-capable deployment topology, live unique indexes, a reviewed policy, an authoritative employee roster, and independently provisioned ExpectedSubmission rows are not verified or available from repository evidence. Proceeding would risk split records, unauthorized or unassigned accountability, or inability to represent non-submitters.

This NO-GO is for the write engine. This report itself completes the requested preflight. Phase 3B.2 implementation has not started.

## 1. MongoDB transaction readiness

### Verified repository and runtime findings

- `finalyear-backend/src/config/db.js:19-26` connects using `process.env.MONGO_URI`, sets connection timeouts/pool size, enables `autoIndex`, and enables retryable reads/writes. It does not configure or verify a replica set and contains no transaction/session usage.
- `finalyear-backend/src/server.js:25-43` starts the database connection asynchronously and starts the HTTP server separately. Startup is not sequenced to wait for connection success. This lifecycle is existing shared application behavior; changing it is outside this preflight.
- Source search found no `startSession`, `withTransaction`, or transaction implementation in application source.
- `finalyear-backend/package.json` declares `mongoose: ^8.1.0`. The installed runtime inspected without connecting is Mongoose **8.23.0** and exposes `mongoose.startSession` and `mongoose.connection.startSession` functions. This verifies client API capability only; it does not verify server topology or transaction support.
- No `package-lock.json` was present at `finalyear-backend/package-lock.json`; the declared version range is not pinned by that file.
- `finalyear-backend/src/config/env.js` and the server startup reference `MONGO_URI`. The backend `.env` and `.env.example` filenames exist. Their values were not read, printed, copied, or used to connect.
- No Docker Compose, `mongod` configuration, or other in-repository replica-set definition was found in the project tree.

### Deployment assessment

**Transaction support: UNVERIFIED.** No isolated test replica set is identified by repository configuration. No production or application MongoDB connection was attempted. A MongoDB URI, retryable-write option, or Mongoose session method does not prove multi-document transaction support. MongoDB transactions require a replica set or sharded deployment.

Before transaction tests, an administrator must provide an explicitly isolated, disposable test deployment and a test-only URI. Its identity and replica-set/sharded status must be confirmed using that test deployment's server status/hello response. Tests must refuse to run if the configured host/database is not the approved isolated target. Do not use the application `.env` or production credentials.

No independent-write fallback is approved. If an isolated deployment cannot support transactions, stop and obtain approval for a separately designed consistency/reconciliation architecture; do not silently perform two independent writes.

## 2. Submission policy readiness

### Verified implementation

- `finalyear-backend/src/models/SubmissionPolicy.js:4-63` requires `policyVersion` and `effectiveStartDate`; defines `deadlineLocalTime` (default `09:30`), `timezone` (default `Asia/Kolkata`), `workingWeekdays` (default ISO weekdays `[1,2,3,4,5]`), nullable `effectiveEndDate`, and `active` (default `true`). It validates IANA timezone, local time/date formats, unique weekdays in 1–7, and date-range order.
- `SubmissionPolicy.js:72-79` declares a unique `policyVersion` index plus an effectivity lookup index.
- `finalyear-backend/src/services/submissionPolicyService.js:95-119` selects active policies whose effective range contains the reporting date; it errors when none or more than one matches. This is fail-closed overlap rejection, not automatic conflict resolution.
- `submissionPolicyService.js:46-92` converts the policy's local deadline to an instant using its IANA timezone and rejects nonexistent or ambiguous local times. `:122-125` classifies `actualSubmittedAt <= deadlineAt` as On-Time and later timestamps as Late.
- `workingWeekdays` is represented and validated on the policy model, but the resolver itself does not evaluate weekdays. A future expected-day provisioner must apply weekdays and approved exceptions when deciding whether an employee-day is expected.
- The repository has model and fake-model tests for defaults, effective-date lookup, overlapping policies, timezone and deadline classification in `finalyear-backend/test/submission-foundation.test.js`. The previously recorded targeted test run passed, but these are not database policy-seed or transaction tests. No policy document was created or inspected.

### Business defaults and first-policy provisioning checklist

The requested policy values are Asia/Kolkata, `09:30`, Monday–Friday, equality is On-Time, and after the deadline is Late. The model defaults match those values. They remain proposed defaults until reviewed and provisioned; defaults do not mean a policy document exists.

Before an authorized administrator provisions the first policy, verify and approve:

1. A unique, human-readable `policyVersion` and a recorded approver/change reference.
2. `effectiveStartDate` equals the explicitly approved go-live date; do not backdate historical accountability.
3. `effectiveEndDate` is null for the initial open-ended policy, or is an approved inclusive end date.
4. `active=true`, `timezone=Asia/Kolkata`, `deadlineLocalTime=09:30`, and `workingWeekdays=[1,2,3,4,5]`.
5. There is no other active policy whose effective range overlaps the proposed range; a future change closes the prior range consistently.
6. The unique policy-version and effectivity indexes are present in the approved target database before writes are enabled.
7. The organization's holiday/leave handling and any exception approval source are approved and documented.
8. A dry-run review verifies generated employee-day counts and deadline instants before provisioning.

No policy document is seeded by this assessment.

## 3. Employee roster readiness

### Verified model contract

`finalyear-backend/src/models/User.js:4-39` provides:

- Employee identity through existing Mongo User `_id` (ObjectId), required `name`, required unique `email`, and `role`. No employee-code field is defined.
- `active` defaults to `false`.
- `teamId` is an optional string defaulting to null.
- `managerId` is an optional ObjectId reference to another User, defaulting to null.
- `employmentStartDate` and `employmentEndDate` are optional ISO date strings; an end date cannot precede a start date.

No employee rows were read. Repository inspection and prior audit documents do not identify an authoritative, approved source of team/manager/employment assignments. The spreadsheet used by ticket reporting must not be presumed to be authoritative for this roster without administrator confirmation. The account email/name is not a substitute for verified assignments.

### Blank administrator onboarding template

Use one row per existing account; leave values blank until an authorized administrator verifies them. Do not include passwords or tokens.

| Existing User `_id` | Verified name | Verified email | Role | Active? | Team ID | Direct Team Lead User `_id` | Employment start (YYYY-MM-DD) | Employment end (YYYY-MM-DD or blank) | Source/approver reference |
|---|---|---|---|---|---|---|---|---|---|
| *(administrator supplies)* | *(administrator supplies)* | *(administrator supplies)* | *(administrator supplies)* | *(administrator approves)* | *(administrator supplies)* | *(administrator supplies)* | *(administrator supplies)* | *(administrator supplies)* | *(administrator supplies)* |

An authorized administrator must supply/approve the current account-to-person mapping, role, active status, team identifier, direct manager mapping, employment dates, and evidence/source for each assignment. The employee identity must map to an existing User `_id`; this phase must not invent IDs or assignments. Team Lead accounts also need an approved role and team assignment. The direct manager relationship for each Team Member must be explicit.

## 4. ExpectedSubmission provisioning strategy

### Model constraints

`finalyear-backend/src/models/ExpectedSubmission.js:4-49` stores immutable `employeeId`, `reportingDate`, `expected`, `deadlineAt`, and `policyVersion`, plus status, exclusion reason/exception, submission reference, and evaluation time. `:51-70` enforces expected/excluded state consistency and requires a submission reference for On-Time/Late while forbidding one for Pending/Missing/Excluded. `:73-84` declares a unique employee/date index and date/status/deadline/status lookup indexes.

These are schema declarations and model validation. They do not establish that corresponding indexes exist in a live database, that referenced User/MetricSubmission documents exist, or that any expected rows have been provisioned.

### Strategy comparison

| Approach | Required inputs and checks | Duplicate / partial-failure handling | Audit and assessment |
|---|---|---|---|
| Manual administrative provisioning | Approved go-live date; reviewed active roster; applicable policy snapshot; working weekdays; approved exceptions/holidays; deadline instant for each expected employee-day. Confirm each User is active and employed on the date. | Unique `(employeeId, reportingDate)` index must prevent duplicates. Use a reviewed transaction/batch boundary or idempotent upsert only after its semantics are specified. Resume by querying the unique keys and comparing full intended values; do not overwrite conflicting rows silently. | Record who approved the roster/policy/go-live and who ran the provisioning, input version/hash, row counts, exclusions, errors, and reconciliation. **Best for a small initial cohort**, after dry-run and index verification. |
| Controlled batch provisioning | Same inputs in a versioned CSV/JSON or admin-approved source; validate every row and produce dry-run diff/counts before writes. Validate dates, User IDs, activation/employment interval, policy coverage and exceptions. | Chunk with explicit checkpoints; use unique index for idempotence; transaction per safe bounded unit if deployment supports it. On restart, reconcile committed units and reject key collisions with changed immutable snapshots. Preserve a manifest of successful/failed units. | Strong reviewability and repeatability. **Recommended initial go-live path** if an approved roster and isolated rehearsal exist; do not implement in this phase. |
| Future scheduled generation | Approved roster/policy/exception source and clear timezone calendar; explicit scheduling window, cutoff and go-live date; active/employment eligibility each day. | Unique employee/date key plus lock/lease or idempotent insert/upsert; record run id and checkpoints. Recover missed runs by bounded, approved catch-up dates; do not backfill before go-live. Transaction availability must be known if multiple dependent records are touched. | Requires operational alerting, run logs, missed-run recovery, audit trail, monitoring and a manual reconciliation path. **Not ready now**; no generator or scheduler should be added until batch semantics are proven.

For every approach, an eligible expected employee-day receives a saved deadline and `policyVersion` snapshot. An approved employee-specific Leave/Exemption affects only that employee; an approved organization-wide Holiday may exclude all eligible employees. Exclusions must preserve reason/exception reference. Pending or unapproved exceptions must not silently exclude an employee. Eligibility must consider active status and employment dates on the reporting date. First generation starts on the explicitly approved go-live date only. Never create expected rows only after an employee submits; doing so would erase the evidence of non-submission.

## 5. API readiness assessment

### Verified Phase 3B.1 source behavior

- `finalyear-backend/src/server.js:20-22, 85-89` imports and mounts the isolated router at `/api/daily-submissions`; legacy `/api/metrics` and `/api/tickets` mounts remain separate.
- `finalyear-backend/src/routes/dailySubmissionRoutes.js:20-27` sets the standard-error marker, applies the store readiness guard, then existing JWT authentication.
- `:29-44` limits POST to `team_member`, validates the body/current Asia/Kolkata date, loads the current User roster data, requires `active=true`, and calls the controller.
- `finalyear-backend/src/middleware/auth.js:12-50` verifies JWT, reloads current User role/email/name and enforces role allowlists. For this API it emits the standard error envelope while preserving legacy route response bodies elsewhere.
- `finalyear-backend/src/services/submissionAccessService.js:5-42` maps authenticated `req.user.id` to a current User and checks active Team Member; `:44-60` provides fail-closed direct Team Lead scope checks; `:62-72` fails closed for Project Manager access unless organization authorization is explicitly supplied.
- `dailySubmissionRoutes.js:46-76` registers four GETs and limits roles to `team_member`, `team_lead`, or `project_manager`. `:78-89` validates detail IDs.
- `finalyear-backend/src/services/dailySubmissionService.js:42-110` validates date, current reporting date and strict KPI body fields. `:132-148` provides the store readiness guard. `server.js:112-117` applies the standard error formatter to marked API requests.
- `finalyear-backend/src/controllers/dailySubmissionController.js:1-30` returns `501 NOT_IMPLEMENTED` for POST and every GET operation.
- Static inspection found no `MetricSubmission.create`, `ExpectedSubmission.create`, or update operation in these route/controller handlers. No actual submission writes are possible through these handlers as currently implemented.

### Scope limitations / changes required before write-engine implementation

- Manager scope helpers exist but are not yet wired into the GET handlers; those handlers currently return 501. Implement and test per-record owner/Team Lead/Project Manager authorization before any future detail read returns data.
- Project Manager organization-wide scope deliberately fails closed absent an explicit organization authorization rule.
- Current POST date validation is hard-coded to the current reporting date; future policy/go-live and exception rules must be checked against the expected-day row in the write service.
- The actor is loaded after auth separately; future write logic must ensure account activation and employee identity are validated consistently, and must check active/employment eligibility at the write boundary.
- Store readiness checks only Mongoose connection state, not topology, transaction readiness, expected-day provisioning, or live index presence.
- The API's 501 handler is a useful write barrier and must remain until all prerequisites and transaction tests pass.

## 6. Proposed future submission transaction sequence

This is architecture only; no transaction was implemented.

1. Authenticate JWT and load the current User; require `team_member`, active account, and the authenticated User `_id`. Never accept employee identity from the request.
2. Strictly validate the allowlisted KPI payload and exact date-only format before opening a transaction. Reject client time, status, deadline and policy fields.
3. Determine the current reporting date using `Asia/Kolkata`; require the requested date to be eligible under approved go-live and window rules.
4. Capture one server timestamp once for the logical request and retain that same timestamp across transaction callback retries. Clarify whether the contract means request-received time or post-eligibility time; do not recalculate the punctuality timestamp on a retry.
5. Start a session/transaction only after the deployment has been verified as transaction-capable.
6. In the transaction, reload/check current account state if the consistency policy requires protection from concurrent deactivation, then query `ExpectedSubmission` by authenticated employee ID and reporting date.
7. Verify exactly one matching expected row exists, employee/date match, `expected=true`, status is Pending or Missing, and `submissionId` is null. Reject absent, Excluded, already-linked, or inconsistent records; never create the expected row here.
8. Validate the saved `deadlineAt` is a valid Date and `policyVersion` is present. Use this immutable snapshot, not the currently active policy, to classify the employee-day.
9. Classify On-Time when the captured timestamp is less than or equal to the saved deadline; otherwise Late. Insert `MetricSubmission` with server-derived employee, timestamp, deadline, status, policy version and normalized KPI values.
10. Conditionally update the same `ExpectedSubmission` only if its key still matches and status/reference remain eligible/null; set final status, submission ID, and evaluation timestamp. Require exactly one row to match/update.
11. Commit. Return the persisted canonical record only after successful commit. Do not send email, update Sheets, create alerts, or perform other external side effects inside a transaction callback.
12. On any pre-commit failure, abort/rollback the transaction. Both records must either commit together or neither persist.

### Concurrency, retry and recovery semantics

- The unique `(employeeId, reportingDate)` index on `MetricSubmission` is the final duplicate guard; conditional claim/update of the ExpectedSubmission plus its unique employee/date key prevents two successful submissions for one expected day.
- Duplicate-key error `11000` should trigger a canonical read by employee/date. If normalized KPI values match, return the original record as a same-value replay (`replayed=true`) without changing timestamp/status; if values differ, return `409 ALREADY_SUBMITTED`. Never overwrite values as an implicit correction.
- Driver transaction helpers may retry transient transaction failures and commit operations with unknown outcomes. The transaction callback must be safe to replay and have no external side effects. Keep the logical request timestamp stable across callback retries.
- If commit outcome remains unknown after driver handling, query the canonical employee/date record using an appropriate read concern. If found, compare normalized values and return replay/conflict. If the database cannot establish outcome, return a retryable/indeterminate result and require the caller to retry the exact same values; do not claim rollback or success without evidence.
- A known abort rolls back both writes. Same-value retries must not update the original record; changed-value retries conflict and use a later approved correction process.
- A durable request-level idempotency key is not currently in `MetricSubmission`; adding one would be a separate schema/API decision. Baseline duplicate semantics can compare normalized KPI values against the unique canonical employee/date record.

## 7. Unique-index verification requirements

Declared indexes:

- `MetricSubmission`: unique `{ employeeId: 1, reportingDate: 1 }`, name `uniq_metric_submission_employee_date` (`MetricSubmission.js:70-73`).
- `ExpectedSubmission`: unique `{ employeeId: 1, reportingDate: 1 }`, name `uniq_expected_submission_employee_date` (`ExpectedSubmission.js:73-76`).
- `SubmissionPolicy`: unique `{ policyVersion: 1 }`, name `uniq_submission_policy_version` (`SubmissionPolicy.js:72-75`).

The offline foundation tests inspect the model schema declarations only. No database index was inspected or built during this assessment. Before any enabled writes, use only the isolated approved test deployment to initialize models, inspect actual `listIndexes()` key/name/unique values, and test duplicate rejection. Before production rollout, an authorized migration/runbook must check for preexisting duplicate employee/date or policy-version data and safely build/verify indexes. `autoIndex:true` is configuration, not evidence that indexes exist, completed successfully, or are suitable for production.

## 8. Testing environment requirements

No in-repository isolated MongoDB replica-set test configuration was found. External test infrastructure availability is **UNVERIFIED**. This preflight did not connect to any MongoDB deployment or execute tests.

Required before write-engine acceptance:

1. An explicitly identified disposable test database on a replica set or sharded deployment, separated from application and production databases.
2. A test-only URI supplied through a controlled test environment; preflight guard verifies approved host and database identity before connecting.
3. A topology assertion in test setup and a clean fixture database; never fallback to the application `.env` URI.
4. Isolated tests for transaction atomicity/rollback, concurrent same-user/date requests, same-value retry, changed-value conflict, duplicate-key handling, transient transaction retry, and unknown commit outcome recovery.
5. Actual unique-index initialization/list verification and duplicate rejection on that isolated database.
6. Offline unit tests for request validation, saved deadline/policy snapshots, deadline boundary, inactive account, missing/excluded/invalid expected row, identity/date mismatch and access-scope denial.
7. Only explicitly named test files may be invoked. Do not use unrestricted `node --test` discovery because this backend includes legacy scripts that contact external services. The last implementation turn's broad discovery ran integration scripts; future preflight and Phase 3B.2 verification must target allowlisted test files only.

Previously recorded Phase 3B.1 targeted test results were 10 API tests and 26 foundation tests passing. Those tests use mocked database lookup/schema validation and do not constitute database integration, index, concurrency, or transaction test evidence. No tests were run during this read-only assessment.

## 9. Security and operational risks

- **Atomicity:** without verified multi-document transactions, MetricSubmission and ExpectedSubmission could diverge. Independent writes are not an acceptable silent fallback.
- **Roster trust:** no authoritative roster source or approved assignments are established. Default `active=false` and null team/manager values appropriately fail closed but block launch.
- **Authorization:** Manager scope helpers are not yet exercised by live read handlers; PM scope lacks an approved organization-wide rule. Team-wide reads must not be enabled by role check alone.
- **Expected-day accountability:** without pre-created expected rows, missing submissions are invisible. Ad hoc creation during POST would defeat accountability.
- **Policy:** no policy record/go-live date is provisioned. Model defaults are not a reviewed operational policy. Weekday/exception eligibility must be applied by the future provisioner.
- **Index uncertainty:** declared schema indexes are not confirmed in any database. Duplicate safety is not established until actual indexes exist.
- **Startup/readiness:** server begins listening without awaiting DB connection; API readiness state does not prove transaction/index/policy/roster readiness.
- **Privacy/logging:** shared auth middleware logs decoded JWT claims and request user details. The current JSON request logger runs before body parsing, but logging order and auth logs should be reviewed before production operation. Avoid logging KPI remarks or tokens.
- **External systems:** the previous implementation turn's unrestricted test discovery contacted email and Google Sheets integration scripts. This read-only preflight did not repeat those calls; Phase 3B.2 checks must use explicit allowlisted test files only.
- **Operations:** batch recovery, audit ownership, failed-run alerting, go-live change control and correction procedures need owners before launch.

## 10. Unresolved decisions

1. Which MongoDB deployment is the approved disposable replica-set/sharded test environment, and who provides its test-only URI?
2. What source is authoritative for employee-to-User, team, Team Lead, active and employment-date mappings?
3. Who approves first policy version and the exact go-live date? Is the 09:30 IST Monday–Friday rule approved for every employee?
4. Which role/source approves organization-wide PM access and manager visibility?
5. Who approves leave, exemption and holiday records; what organization-wide holiday calendar is authoritative?
6. Should submission time mean server receipt time or time captured after pre-transaction validation? The chosen timestamp must remain stable through transaction retries.
7. Is baseline same-value duplicate replay sufficient, or is a persisted idempotency key required?
8. What bounded history period and inaccessible-detail behavior (403 vs concealed 404) are required?
9. Who owns provisioning audit, batch recovery and production index migration?
10. What process handles exact duplicate requests after an unknown commit outcome when the database is temporarily unavailable?

## 11. Exact prerequisites before implementation

- Administrator identifies and provisions an isolated transaction-capable test deployment; verify topology before running any database test.
- Administrator names the authoritative roster source and supplies reviewed mappings using the blank template above; verify all users, roles, activation, team/manager links and employment ranges.
- Administrator approves the policy version, configuration and go-live date; an authorized operator provisions the policy only after approval.
- Approve and document expected-day provisioning approach, exception inputs, dry-run review, audit, duplicate handling, partial-failure recovery and no-historical-backfill rule.
- Confirm both unique employee/date indexes and the policy version index are present in isolated tests; plan a safe production preflight/migration without modifying data in this phase.
- Approve submission timestamp semantics, same-value retry behavior, changed-value conflict behavior, unknown commit handling and manager/PM access rules.
- Implement service-level transaction plus conditional expected-row update; keep POST at 501 until readiness gates pass.
- Add allowlisted unit and isolated transaction/concurrency tests; never run broad integration discovery.
- Establish a reviewed deployment/runbook and rollback/reconciliation procedure before production enablement.

## 12. Safety confirmation

This assessment was read-only. It did not connect to production, the application database, or any test MongoDB; did not inspect or reveal `.env` values; did not create or modify database data; did not seed policies or expected rows; and did not alter application source, frontend, ticket workflows, schedulers, alerts, email, Google Sheets, or dependency manifests. No external integrations or tests were executed during this assessment. The only new artifact is this report. No Phase 3B.2 write-engine implementation has been started.
