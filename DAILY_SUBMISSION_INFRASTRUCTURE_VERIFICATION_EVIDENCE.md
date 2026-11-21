# Daily Submission Infrastructure Verification Evidence

**Evidence consolidation date:** 2026-11-14
**Scope:** Documentation-only consolidation of source safeguards and the supplied Step 5C execution record.

## 1. Purpose and scope

This record distinguishes source-level controls, the supplied execution record, and production facts still unknown. The Step 5C output below is reproduced as supplied and was not independently rerun during this documentation task. No tests, database connections or commands, migrations, or external operations were performed for this report.

## 2. Environment and test target

Current source in `finalyear-backend/test/support/mongoIntegration.js` fixes the test target:

| Property | Configured test target |
|---|---|
| Host | `127.0.0.1` |
| Port | `27018` |
| Replica set | `accountabilityTestRS` |
| Application integration database | `accountability_app_integration_test` |
| Separate probe database | `accountability_transaction_test` |

The helper validates the URI before connecting, allowing only the fixed host, port, application test database, and replica-set option; credentials and unexpected options are rejected. It does not read `.env`, `MONGO_URI`, or application config, and requires a fresh disconnected Mongoose client. It sets `autoCreate: false` and `autoIndex: false`. After connection it checks host, port, database, ready state, replica-set name, writable-primary status, and the approved single member when the host list is reported.

These are source-level safeguards; this report does not claim every guard was independently demonstrated by the supplied run. The probe database is separate and is not used by this test. The integration test imports support, models, and the read service directly; it does not import/start `src/server.js` or invoke schedulers, email, or Google Sheets workflows.

## 3. Test harness safety controls

Source inspection confirmed:

- Fixed target constants and pre-connect validation; no production URI fallback.
- Post-connect target and replica identity checks.
- Automatic collection/index creation disabled.
- Synthetic fixtures are explicitly created through fixture helpers.
- Cleanup is registered-ID and ownership aware. It reads only registered documents and deletes only when persisted ownership fields still match.
- Cleanup allowlist: `users`, `submission_policies`, `expected_submissions`, `metric_submissions`. It does not use collection-wide `deleteMany`, drop databases/collections, or drop indexes.
- `submission_corrections` is outside the allowlist and was not inspected or modified for this report.
- The test checks absence of its registered fixtures after cleanup; it does not assert every collection is globally empty.

## 4. Step 5C execution record

The following record is reproduced **exactly as supplied**. It is user-supplied execution evidence and was not rerun for this report.

**Date:** 2026-11-14
**Command executed:**

```powershell
node --test test/daily-submission-read-transaction-integration.test.js
```

**Result:**

```text
✔ offline instrumentation restores normally and repeated restoration is harmless
✔ offline instrumentation restores methods after a transaction callback failure
✔ offline instrumentation restores the connection when withTransaction instrumentation fails
✔ offline instrumentation restores the partial session patch when endSession instrumentation fails
✔ getOwnDay reads a synthetic Pending day in the production snapshot transaction
✔ production read transaction runner aborts a session-bound synthetic read and ends its session

tests 6
pass 6
fail 0
skipped 0
todo 0
```

The supplied record states the test completed successfully.

**MongoDB test service preflight supplied:**

```text
Service: MongoDBAccountabilityTest
Status: Running
StartType: Automatic
```

The supplied record says `Test-NetConnection 127.0.0.1 -Port 27018` was invoked, but omitted an explicit `TcpTestSucceeded` value. This report does not invent one. The reported successful guarded test is evidence that the harness connected to its configured target during that run, but does not replace the missing TCP output.

## 5. MongoDB-backed test scenarios

### Scenario A — Production read service

Test: `getOwnDay reads a synthetic Pending day in the production snapshot transaction`.

The test creates synthetic User, SubmissionPolicy, and Pending ExpectedSubmission fixtures using a fixed reporting date and clock. It calls the real `getOwnDay()` without overriding the transaction runner, therefore using the production runner bound to the guarded default Mongoose connection. Assertions check returned employee/date/state/policy, null submission, and no MetricSubmission for that employee/date. Instrumentation checks User, ExpectedSubmission, and MetricSubmission reads use the same active transaction session and that options are primary read preference plus snapshot read concern. Registered fixtures are cleaned up and verified absent. This is evidence for the local target according to the supplied record, not production behavior.

### Scenario B — Read transaction abort and cleanup

Test: `production read transaction runner aborts a session-bound synthetic read and ends its session`.

It calls actual `runReadTransaction()`, performs a session-bound synthetic User read, then throws a sentinel error. Assertions verify sentinel propagation, active session binding, primary/snapshot options, and `endSession()` invocation. It verifies read abort and session cleanup; it does **not** prove write atomicity because no write occurs.

## 6. Offline instrumentation coverage

The four fake-object tests cover: normal restoration and repeated restore; restoration after callback failure; restoring connection `startSession` after `withTransaction` instrumentation fails; and restoring the connection plus a prior session patch after `endSession` instrumentation fails. These test observer patch restoration, not MongoDB transactions.

## 7. Evidence and verification matrix

| Area | Category | Status and limit |
|---|---|---|
| Local MongoDB test service | Supplied preflight | Reported Running, Automatic; not independently checked here. |
| Guarded test target | Source inspection | Fixed identity and runtime checks present. |
| TCP preflight | Supplied record | Invoked; no explicit `TcpTestSucceeded` value supplied. |
| Real read-service transaction | Supplied Step 5C record + test source | Scenario A reported passed on guarded local target; not rerun here. |
| Session propagation | Supplied record + source assertions | A and B assert observed session binding inside transaction. |
| Read abort | Supplied record + test source | Scenario B reports sentinel propagation after deliberate abort. |
| Session cleanup | Supplied record + test source | `endSession()` invocation asserted. |
| Fixture cleanup | Source + test assertions | Owned registered fixtures checked absent; no global-empty claim. |
| Test database indexes | Not verified | No Step 5C index evidence supplied. |
| Production topology/version/database identity | Not verified | Unknown. MongoDB 8.0.13 in older records is historical, not verified during Step 5C. |
| Production indexes/transaction capability | Not verified | Unknown. |
| Production deployment readiness | Not established | Local test evidence is insufficient. |

## 8. Production infrastructure gaps

Obtain separate evidence for production MongoDB version and topology; production target identity without credentials; transaction capability in an approved representative non-production environment; required index definitions in the intended deployment; and deployment/operational sign-off. Step 5C did not establish production topology, version, identity, live indexes, production transaction support, or deployment readiness.

## 9. Application readiness and endpoint status

`finalyear-backend/src/services/dailySubmissionReadiness.js` is a synchronous, no-database-operation predicate. It checks connection readiness and that User, ExpectedSubmission, and MetricSubmission are registered on that connection. Its source comments leave transaction and index readiness to separate deployment verification.

`finalyear-backend/src/server.js` injects the read service into `createDailySubmissionController()` with `enableSelfServiceReads: false`; the router receives the readiness predicate. The disabled/default controller retains 501 stubs. Thus these remain disabled:

- GET `/api/daily-submissions/me/current`
- GET `/api/daily-submissions/me/:reportingDate`
- GET `/api/daily-submissions/me/history`
- POST daily submission
- GET submission detail

POST and detail remain `501 NOT_IMPLEMENTED`. This report does not activate or authorize activation.

## 10. Final assessment and next prerequisites

**Assessment:** The supplied Step 5C record reports passing local guarded read-transaction scenarios and four offline observer tests. Current source confirms fixed-target guards, disabled automatic collection/index creation, and registered-owner cleanup limited to four approved collections.

This evidence does not establish production topology, version, identity, indexes, transaction capability, or deployment readiness. The missing explicit TCP result remains unknown. Before any future activation decision, obtain and review infrastructure evidence, verify required indexes read-only in the approved target, and complete deployment/monitoring sign-off. Endpoint activation needs separate explicit authorization.

**Activity confirmation:** No tests, database connections/operations, external actions, or `.env`/secret reads were performed for this task. No application source/configuration was modified. Only this requested Markdown report is to be created.
