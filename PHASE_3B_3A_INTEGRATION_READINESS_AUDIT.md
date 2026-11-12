# Phase 3B.3A — Application Integration Readiness Audit

**Project:** Automated Accountability System with Real-Time PM Alerts  
**Assessment date:** 2026-11-11  
**Scope:** Read-only source and test-infrastructure inspection. No tests were executed and no MongoDB connection was opened.

## 1. Executive summary

The repository contains the Phase 3A submission schemas and a Phase 3B.1 route scaffold. The supplied isolated local replica-set probe established transaction commit/abort capability for `accountabilityTestRS`, but that probe database must not be reused for application integration data. The write endpoint still returns 501, and no application transaction has been implemented or tested.

Application integration testing is technically feasible, but it is **not ready to run yet**. The test harness must be explicitly pinned to a separate database on `127.0.0.1:27018`, guard host, port, database name, and replica-set identity before connecting, and avoid all app `.env` loading and application startup. Current model registration uses Mongoose's default connection; a dedicated `createConnection()` will not automatically route those model imports to the isolated connection. A safe test-only wiring strategy must be chosen in Phase 3B.3B.

**Decision: NO-GO for running application database integration tests until the isolation harness and guard are implemented and reviewed.** This audit does not change or enable persistence.

## 2. Existing database architecture

### Connection setup and lifecycle

- `finalyear-backend/src/config/db.js:3-27` exports `connectDB()`, registers Mongoose connection event handlers, then calls `mongoose.connect(process.env.MONGO_URI, ...)`. It enables `autoIndex`, `retryWrites`, and `retryReads`, sets timeouts/pool size, and has no replica-set assertion or transaction/session code.
- `finalyear-backend/src/config/env.js:1-8` calls `dotenv.config()` and defines a fallback application URI when `MONGO_URI` is absent. It is unsafe to import from an integration-test harness because it loads `.env` and provides a default application database.
- `finalyear-backend/src/server.js:27-44` loads a `.env` path, starts `connectDB()` in a detached async IIFE, and calls `startServer()` later in the module (`:173-195`) without awaiting DB readiness. It also initializes the existing alert scheduler after DB connection (`:34-38`). Importing this entry point for tests would start application services and is prohibited.
- The new submission router has a Mongoose ready-state guard, but this only reports whether the default connection is open; it does not establish the intended database name, topology, indexes, or transaction readiness.
- Connection shutdown code exists in both connection/server lifecycle areas. A dedicated integration test process should own its test connection lifecycle and close it in `finally`, without importing or starting the application server.

### Model registration and test-isolation constraint

All reviewed model files call `mongoose.model(...)`, which registers each model against Mongoose's default connection. The transaction service and existing model imports also refer to those default-registered models. `SubmissionCorrection.js:86-90` has a `pre("validate")` hook that explicitly resolves `mongoose.model("User")`, so merely compiling its schema on another `createConnection()` would not redirect that hook's User lookup. For the immediate isolated test harness, use a separate Node process that never imports `server.js` or `config/env.js` and explicitly connects the default Mongoose instance to the guarded test-only database. If Phase 3B.3B instead chooses `createConnection()`, it must first provide connection-aware model/service injection and cover the correction hook's model lookup; a second connection alone is insufficient.

## 3. Model and index inventory

Model index declarations are schema metadata only. No live database indexes or records were inspected in this audit.

| Model / collection | Fields, types, requirements and defaults | References, validation and hooks | Declared indexes |
|---|---|---|---|
| `MetricSubmission` / `metric_submissions` | Employee ObjectId, ISO `reportingDate`, actual and applicable deadline Dates, `On-Time`/`Late` status, metrics subdocument (five nonnegative integer counts and remarks up to 1000 chars), policy version; timestamps; strict schema. Core fields required; identity/date/time/status/version immutable. | `employeeId` references User. Date validator is strict ISO date. Metrics subdocument is strict and `_id:false`. No model hooks. Schema reference does not enforce target existence. | Unique `(employeeId, reportingDate)` named `uniq_metric_submission_employee_date`; `(reportingDate,status)`; `(employeeId, reportingDate desc)`. |
| `ExpectedSubmission` / `expected_submissions` | Employee ObjectId, ISO reporting date, `expected`, status default `Pending`, saved deadline Date, policy version, reason code, exception ID, submission ID, evaluated timestamp; timestamps; strict schema. Employee/date/expected/deadline/policy version immutable. | References User, SubmissionException and MetricSubmission. `pre("validate")` enforces expected/excluded state and submission-reference presence/absence. It does not query to prove that the referenced submission exists or matches the same employee/date. | Unique `(employeeId, reportingDate)` named `uniq_expected_submission_employee_date`; `(reportingDate,status)`; `(status,deadlineAt)`. |
| `SubmissionPolicy` / `submission_policies` | Required policy version; deadline default `09:30`; timezone default `Asia/Kolkata`; ISO weekdays default `[1,2,3,4,5]`; required effective start; nullable end; `active` default true; timestamps; strict schema. | Validates local-time format, IANA timezone, weekday values/uniqueness, ISO dates and end not before start. `pre("validate")` enforces range order. Policy service rejects zero or multiple active effective matches. Weekdays are stored/validated but the resolver does not itself apply them. | Unique `policyVersion` named `uniq_submission_policy_version`; `(active,effectiveStartDate,effectiveEndDate)`. |
| `SubmissionAlert` / `submission_alerts` | Employee/date/expected row, optional submission, alert type, trigger time, recipient, acknowledgement/resolution/delivery states, attempts, retry time, idempotency key; status defaults Unacknowledged/Open/Queued and attempts 0; timestamps; strict schema. | References User, ExpectedSubmission and MetricSubmission. Date, alert identity/type, trigger, recipient and idempotency key immutable. Attempts must be a nonnegative integer. No hooks in this schema. | Unique `idempotencyKey` named `uniq_submission_alert_idempotency`; `(reportingDate,resolutionStatus)`; `(recipientUserId,acknowledgementStatus)`; `(deliveryStatus,nextAttemptAt)`. |
| `SubmissionException` / `submission_exceptions` | Optional employee ID, required start/end dates, type Leave/Holiday/Exemption, required reason (max 500), approval status default Pending, approver/time; timestamps; strict schema. | References User. `pre("validate")` checks date order, employee presence for Leave/Exemption, required approval metadata for Approved and forbids approval metadata otherwise. Global Holiday may have null employee. | `(employeeId,startDate,endDate,approvalStatus)`; `(exceptionType,startDate,endDate,approvalStatus)`. |
| `SubmissionCorrection` / `submission_corrections` | Submission/employee/modifier IDs, correction timestamp, previous/corrected metric snapshots, reason, approval status default Pending, approver/time, original submit/deadline/status evidence; timestamps; strict schema. Snapshot fields and reason are immutable. | References MetricSubmission and User. `pre("validate")` requires approval metadata for Approved, rejects self-approval, and queries the global User model to restrict approver role to Team Lead/Project Manager. This global-model lookup is a cross-connection test concern. | `(submissionId,correctionTimestamp desc)`; `(employeeId,correctionTimestamp desc)`; `(approvalStatus,createdAt)`. |
| `User` | Required name/email/password/role, email unique, role enum; `active` defaults false, `teamId` null, `managerId` null, employment dates null; optional roster fields. | `managerId` references User. Employment dates use ISO validation and end cannot precede start. No hooks in this schema. No team/manager/employment assignments were inspected or supplied. | Unique email path declaration; no other compound index declared in this model. |

The submission-related unique constraints protect one submission and one expected-day row per employee/date **only when the actual database indexes exist**. `autoIndex:true` is not evidence that indexes were created successfully. Existing duplicate records could block index creation; live index inspection was not performed.

## 4. Transaction integration assessment

The isolated replica-set probe supports the MongoDB capability required by an application transaction test. Application feasibility remains conditional on an isolated connection harness, fixture/index readiness, and service implementation.

Planned test coverage should prove:

- **Atomic success:** create one MetricSubmission and update its matching ExpectedSubmission in one session; verify both final records after commit.
- **Rollback on second-operation failure:** force a conditional ExpectedSubmission update to match zero rows or fail; abort and verify the first MetricSubmission insert is absent.
- **Duplicate employee/date:** verify the actual unique MetricSubmission index rejects a second insert and the service maps/reconciles duplicate-key error `11000`.
- **Concurrent requests:** issue competing submissions for the same employee/date; assert exactly one canonical record and consistent ExpectedSubmission linkage.
- **Retry behavior:** test transient transaction retry with stable request timestamp and no external side effects in the callback.
- **Unknown commit outcome:** inject/simulate ambiguous commit handling where possible; verify the service re-reads canonical employee/date state before deciding success, conflict, or indeterminate retry response.

These tests do not exist yet. A transaction-capable local replica set alone does not validate Mongoose transaction wiring, session propagation, application atomicity, driver retry behavior, or unique index presence.

## 5. Test isolation design

### Dedicated target

Use an application integration-test database distinct from the verified transaction probe database. Proposed fixed test-only target:

- Host: `127.0.0.1`
- Port: `27018`
- Replica set: `accountabilityTestRS`
- Database name: `accountability_app_integration_test`
- Probe database that must remain separate: `accountability_transaction_test`

The proposed name is a design value, not a database created or checked by this audit.

### Required test-only guard

Phase 3B.3B should introduce a test support module that:

1. Contains explicit test-only host, port, replica-set and database constants. It must not load dotenv, read application `.env`, import `config/env.js`, read `MONGO_URI`, or use a generic environment fallback.
2. Builds the test target only from those approved constants. Before any connection attempt, parses and asserts host exactly `127.0.0.1`, port exactly `27018`, database exactly `accountability_app_integration_test`, and replica set exactly `accountabilityTestRS`; reject credentials and any unexpected URI options. Do not log the URI or credentials.
3. Connects only after every guard passes, with short bounded server-selection timeouts. A failed connection is a hard test setup failure; it must never fall back to `localhost:27017`, `finalyear`, `finalyear_metrics`, an application `.env` value, or another host.
4. Runs in a dedicated test process that imports models/services but never `server.js`, app startup, scheduler, alert, email or Sheets modules. With current global model registration, connecting the default Mongoose instance to this fixed test target is the straightforward option; do not mix application and test connections in one process.
5. Verifies the connected Mongoose connection's host/port/database and replica-set identity before model initialization or cleanup. Any mismatch aborts before destructive operations.
6. Calls model index initialization only after the target guard and fixture cleanup. Inspect `listIndexes()` for names/keys/unique flags in this test database; do not infer live indexes from schema declarations.
7. Cleans only an explicit allowlist of submission-test collections with `deleteMany({})` after guards; do not call `dropDatabase()`. Preserve indexes. Seed deterministic test-only User/policy/expected fixtures after cleanup. Always close the test connection in `finally`.
8. Uses no production credentials. If local authentication becomes necessary, design a separate test-only secret mechanism that does not load or print application `.env` values; this local probe configuration currently has no authentication requirement supplied for this audit.

A future DI/model-registration refactor could permit a separate `createConnection()`. If chosen, model and service code must be connection-aware, and `SubmissionCorrection`'s global User lookup must be corrected or excluded from that connection's coverage until fixed. This audit makes no source change.

## 6. Explicit test execution strategy

### Existing safe targeted files

The package has no test script; `finalyear-backend/package.json` defines only `start` and `dev`. Existing explicitly named offline tests are:

- `node --test test/submission-foundation.test.js` — schema/policy validation and unit behavior; no live DB required.
- `node --test test/daily-submissions-api.test.js` — router/auth tests with mocked User lookup and a temporary loopback HTTP server; no Mongo connection required.

Neither command was executed during this audit.

### Future integration files

After the dedicated guard exists, run only explicitly named files, for example:

- `node --test test/integration/daily-submission-transaction.integration.test.js`
- `node --test test/integration/daily-submission-concurrency.integration.test.js`
- `node --test test/integration/daily-submission-indexes.integration.test.js`

Run from `finalyear-backend` in a fresh Node process. Before destructive fixture cleanup, the harness must print only a sanitized target identity (host/port/test database name) and fail closed if any guard differs. Never use unrestricted `node --test` discovery, `npm test` until it is explicitly constrained, or any command that launches legacy integration scripts.

### Existing side-effect hazards

- Previous unrestricted `node --test` discovery in this project ran legacy scripts that sent test email and accessed Google Sheets. Source inspection confirms `src/test-email.js` calls `transporter.sendMail()` and `src/test-sheets-config.js` validates/accesses the configured spreadsheet and reads metadata.
- `test-auth.js` accesses Google Sheets. `test-alert-email-integration.js` calls `mongoose.connect()` with a legacy default database fallback and imports alert/email services. Other root-level `test-*.js` scripts include SMTP, email, alerts, endpoints, service and external deployment tests; they must be individually inspected and allowlisted before execution.
- Because of these auto-discovered files and the prior external side effects, broad discovery is prohibited. Do not execute integration-like scripts outside the dedicated test directory.
- The two named offline tests are the only current files identified for safe routine execution, and their names must be passed explicitly.

### Cleanup safety

The application integration database can be cleaned safely between runs only after the host, port, replica set and exact dedicated database name have been programmatically verified. Restrict cleanup to known test collections and deterministic fixtures. Do not clean the probe database, application database or any database selected from an unguarded environment variable. Keep logs credential-free and avoid recording KPI remarks or full records.

## 7. Risks and mitigations

| Risk | Mitigation / gate |
|---|---|
| Unique index declarations mistaken for live protection | Initialize and inspect indexes only in the dedicated test DB; check duplicate fixture keys; require authorized production migration/verification before writes. |
| Partial persistence if transaction/session is omitted from either operation | Service tests must assert session passed to both insert and conditional update; force second-step failure and verify rollback. |
| Global model registry points tests at default connection | Use a fresh isolated Node process with a hard-coded guarded test target; never import server/config startup. If using `createConnection`, implement connection-aware model/service injection first. |
| Correction validation query escapes a separate connection | Hook currently uses `mongoose.model("User")`; test in same guarded default connection or refactor dependency before separate-connection tests. |
| Wrong DB cleaned by test setup | Host/port/replica-set/db-name assertions before connection and before cleanup; allowlisted `deleteMany`; never `dropDatabase`; hard-fail on mismatch. |
| App startup starts scheduler and legacy services | Never import `src/server.js`; use a purpose-built test setup that imports only models/services under test. |
| Default URI or dotenv leaks into test target | No dotenv, no `config/env.js`, no `MONGO_URI`, no fallback. Compose target from test constants and verify before connect. |
| Nonexistent/different `ExpectedSubmission` state | Seed deterministic expected row; service must conditionally claim Pending/Missing with null submission ID and check matched count. |
| Retry duplicates side effects or timestamp changes | Keep callback database-only; capture request timestamp once outside retry callback; canonical read after duplicate/uncertain commit. |
| Legacy tests contact email/Sheets or DB | Explicit file allowlist only; never broad Node test discovery; review each newly introduced test's imports for side effects. |
| Cleanup removes useful unrelated test data | Dedicated database and collection allowlist; never use application/probe DB; verify final test collections are empty when required. |

## 8. Unresolved decisions

1. Confirm that `accountability_app_integration_test` is the approved dedicated database name on the isolated local replica set and that no existing data needs preservation.
2. Choose the model test connection strategy: guarded default Mongoose connection in a fresh process now, or a reviewed connection-aware model/service refactor before using `createConnection()`.
3. Decide whether production/test code should disable `autoIndex` and use explicit index migrations; this audit does not alter the current config.
4. Define who owns disposable test instance lifecycle, test DB cleanup, and recovery if a process is interrupted.
5. Define the transaction service API and guarantee that both writes receive the same session.
6. Define exact unknown-commit response/retry contract and same-value versus changed-value duplicate behavior.
7. Determine how integration tests seed User records safely without importing app startup or external integrations.
8. Review whether all legacy root `test-*.js` files can be excluded from future runner configuration; no runner change is made here.

## 9. Recommended Phase 3B.3B implementation plan

1. Create a test-only support module with fixed local host/port/replica-set/database constants and strict pre-connect guards; do not read `.env` or generic Mongo environment variables.
2. Run test support in a fresh Node process and import only the submission models and service under test. Do not import server entry point, schedulers, alert/email/Sheets services, or legacy test files.
3. Resolve model registration for the guarded test connection. Prefer the current default Mongoose connection in that isolated test process unless connection-aware model dependency injection is explicitly added. Address the correction hook's global User lookup if corrections are included.
4. Add a collection allowlist and deterministic fixture helper. Verify target identity before `deleteMany`; preserve indexes; close the connection in `finally`.
5. Initialize and inspect actual test database indexes, then test duplicate key behavior.
6. Implement transaction tests for atomic success, forced rollback, concurrent duplicate submissions, same-value replay, changed-value conflict, transient retry, and unknown commit reconciliation.
7. Keep application POST returning 501 until the write service, tests, indexes, policy, roster, expected-day provisioning and production approval gates are complete.
8. Run only explicit test paths; maintain a runner allowlist so the legacy external scripts cannot be auto-discovered.

This plan is advisory; Phase 3B.3B implementation has not begun.

## 10. Go/No-Go decision

**NO-GO for application integration test execution today.** The local replica-set transaction probe is a useful prerequisite, but the dedicated application test database guard and model connection strategy do not yet exist, and live indexes/application transaction semantics remain unverified. First implement and review the safe test harness described above.

**GO for Phase 3B.3B planning only.** Once the harness guards and fixture isolation are implemented, application transaction/index/concurrency tests may run against the approved dedicated database. Passing those tests will still not by itself authorize production submission writes.

**Submission persistence remains disabled.** The Phase 3B.1 POST handler must continue returning `501 NOT_IMPLEMENTED`.

## 11. Safety confirmation

This audit read repository source and test files only. It did not read `.env` values, connect to MongoDB, execute application tests, contact Google Sheets or email, run schedulers/alerts, modify application data, or change application source/configuration/dependencies. Only the requested Markdown report is to be created.
