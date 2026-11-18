# Daily Submission Infrastructure Verification Evidence

**Original evidence date:** 2026-11-14  
**Verification supplement date:** 2026-11-17  
**Project:** Automated Accountability System with Realtime PM Alerts  
**Scope:** Database lifecycle, transaction infrastructure, topology verification, index verification, regression testing and production-readiness evidence.

---

# Part A — Original Evidence Record (2026-11-14)

## 1. Purpose and scope

The original evidence record distinguishes source-level controls, supplied execution records and production facts that remained unknown.

The November 14 Step 5C execution record was supplied by the user and was not independently rerun during the original documentation task.

## 2. Environment and test target

The source file `finalyear-backend/test/support/mongoIntegration.js` fixes the integration-test target:

| Property | Configured test target |
|---|---|
| Host | `127.0.0.1` |
| Port | `27018` |
| Replica set | `accountabilityTestRS` |
| Application integration database | `accountability_app_integration_test` |
| Separate probe database | `accountability_transaction_test` |

The integration helper:
- Validates the URI before connecting.
- Rejects unexpected hosts, ports, databases, credentials and URI options.
- Does not read `.env`, `MONGO_URI` or application configuration.
- Requires a fresh, disconnected Mongoose client.
- Uses `autoCreate: false` and `autoIndex: false`.
- Verifies the connected host, port, database, connection state and replica-set primary.
- Verifies the approved single member when the host list is reported.

The probe database is separate and is not used by this integration test.

The integration test imports its support helper, models and read service directly. It does not import or start `src/server.js`, initialize schedulers or invoke email or Google Sheets workflows.

## 3. Test harness safety controls

Source inspection confirmed:

- Fixed target constants and pre-connect validation.
- Post-connect target and replica identity checks.
- Automatic collection and index creation disabled.
- Synthetic fixtures explicitly registered through fixture helpers.
- Cleanup restricted to registered fixture IDs whose persisted ownership fields still match.
- Cleanup allowlist: `users`, `submission_policies`, `expected_submissions`, `metric_submissions`.
- No collection-wide `deleteMany`, database drop, collection drop or index drop.
- `submission_corrections` is outside the cleanup allowlist.
- Cleanup checks registered fixtures; it does not claim every collection is globally empty.

## 4. Step 5C execution record

**Date:** 2026-11-14

**Command:**

```powershell
node --test test/daily-submission-read-transaction-integration.test.js
```

**Supplied result:**

```text
6 tests
6 passed
0 failed
0 skipped
0 todo
```

The six scenarios covered:
1. Offline instrumentation restores normally and repeated restoration is harmless.
2. Offline instrumentation restores after a transaction callback failure.
3. Connection instrumentation is restored when `withTransaction` instrumentation fails.
4. Connection and partial session instrumentation are restored when `endSession` instrumentation fails.
5. `getOwnDay` reads a synthetic Pending day using the production snapshot transaction.
6. The production read transaction runner aborts a session-bound synthetic read and ends its session.

This was user-supplied execution evidence at the time of the original report.

The supplied MongoDB service preflight reported:

```text
Service: MongoDBAccountabilityTest
Status: Running
StartType: Automatic
```

The supplied record stated that `Test-NetConnection 127.0.0.1 -Port 27018` was invoked, but did not include an explicit `TcpTestSucceeded` value.

## 5. Transaction scenarios

### Scenario A — Production read service

The test creates synthetic User, SubmissionPolicy and Pending ExpectedSubmission fixtures using a fixed reporting date and clock.

It invokes the real `getOwnDay()` without overriding the transaction runner, using the production runner bound to the guarded default Mongoose connection.

Assertions cover:
- Returned employee, date, state and policy.
- Null submission.
- No MetricSubmission for the employee/date.
- User, ExpectedSubmission and MetricSubmission reads using the same active transaction session.
- Primary read preference and snapshot read concern.

Registered fixtures are cleaned up and verified absent.

This is local integration-test evidence, not production evidence.

### Scenario B — Read transaction abort and cleanup

The test calls `runReadTransaction()`, performs a session-bound synthetic User read and deliberately throws a sentinel error.

Assertions cover:
- Sentinel error propagation.
- Active session binding.
- Primary/snapshot transaction options.
- `endSession()` invocation.

The scenario verifies read abort and session cleanup. It does not prove write atomicity because no write occurs.

## 6. Original evidence limitations

The original November 14 report did not establish:
- Integration-test index inventory.
- Production topology or MongoDB version.
- Production database identity.
- Production index inventory.
- Production transaction capability.
- Production deployment readiness.

---

# Part B — Infrastructure Verification Supplement (2026-11-17)

## 7. Infrastructure verifier implementation

A new read-only infrastructure verification service was added:

`src/services/dailySubmissionInfrastructureVerification.js`

Its purpose is to independently verify the database prerequisites for the core daily-submission read infrastructure.

The verifier checks:

1. Database connection readiness.
2. Exact registration of required Mongoose models.
3. MongoDB topology and transaction-compatible topology prerequisites.
4. Actual database index definitions against the model schema declarations.

The required model scope is deliberately limited to:

- `User`
- `ExpectedSubmission`
- `MetricSubmission`

`SubmissionPolicy` is excluded from this core infrastructure verifier.

The verifier does not create indexes, create collections, insert documents, update documents or delete documents.

### Topology handling

| MongoDB topology | Verifier behaviour |
|---|---|
| Replica set with writable primary | Accepts topology prerequisite |
| Standalone | Fails transaction-topology verification |
| Replica-set secondary | Fails primary verification |
| Sharded cluster | Identifies topology but does not claim transaction readiness without separate verification |
| Unknown/unavailable topology | Fails closed |

A verified replica-set primary establishes the required topology prerequisite. It is not a guarantee that every future transaction will succeed.

## 8. Core model and index inventory

The verifier compares declared model indexes against the actual database index inventory.

| Model | Collection | Declared indexes |
|---|---|---:|
| User | `users` | 1 |
| ExpectedSubmission | `expected_submissions` | 3 |
| MetricSubmission | `metric_submissions` | 3 |
| **Total** | | **7** |

The seven core indexes are:

### User

- `{ email: 1 }` — unique, generated name `email_1`.

### ExpectedSubmission

- `{ employeeId: 1, reportingDate: 1 }` — unique, `uniq_expected_submission_employee_date`.
- `{ reportingDate: 1, status: 1 }` — `expected_submission_date_status`.
- `{ status: 1, deadlineAt: 1 }` — `expected_submission_due_status`.

### MetricSubmission

- `{ employeeId: 1, reportingDate: 1 }` — unique, `uniq_metric_submission_employee_date`.
- `{ reportingDate: 1, status: 1 }` — `metric_submission_date_status`.
- `{ employeeId: 1, reportingDate: -1 }` — `metric_submission_employee_history`.

The verifier checks index names, ordered compound-key definitions and relevant semantic options, including uniqueness, sparse behaviour, partial filters and other supported index metadata.

Additional undeclared indexes do not automatically fail verification.

## 9. Real MongoDB integration verification

A separate integration test was created:

`test/daily-submission-infrastructure-verification-integration.test.js`

It uses the existing guarded integration helper and the actual Mongoose models.

**Command:**

```powershell
node --test .\test\daily-submission-infrastructure-verification-integration.test.js
```

**Observed result on 2026-11-17:**

```text
✔ approved integration replica set passes daily-submission infrastructure verification

tests 1
pass 1
fail 0
cancelled 0
skipped 0
todo 0
```

### Verified integration environment

| Property | Observed value |
|---|---|
| Host | `127.0.0.1` |
| Port | `27018` |
| Database | `accountability_app_integration_test` |
| Replica set | `accountabilityTestRS` |
| Topology | One-member replica set |
| Primary | `127.0.0.1:27018` |

### Integration assertions

The test verified:

- Connection readiness.
- Exact registration of the three required models.
- Replica-set topology and expected replica-set name.
- Writable-primary topology prerequisite.
- All seven declared core indexes.
- Empty verifier error list.
- Unchanged index inventory before and after verification.

The before/after index inventory comparison provides direct evidence that the verifier did not alter indexes during this run.

The verifier's source and unit tests also establish that its database inspection path is read-only.

The test does not verify the two SubmissionPolicy indexes.

## 10. Separate local development database index provisioning

A dedicated migration was created:

`scripts/migrations/addDailySubmissionIndexes.js`

Its fixed target is:

| Property | Value |
|---|---|
| Host | `localhost` |
| Port | `27017` |
| Database | `finalyear_metrics` |
| Topology | Standalone |

The migration:
- Uses a fixed target rather than `MONGO_URI`.
- Defaults to dry-run mode.
- Requires explicit `--apply` for index creation.
- Rejects unexpected arguments.
- Checks the active connection identity and standalone topology.
- Checks for duplicate data before unique-index creation.
- Does not create missing collections.
- Does not drop, rename or rebuild existing indexes.
- Verifies expected indexes after provisioning.

The user explicitly executed:

```powershell
node .\scripts\migrations\addDailySubmissionIndexes.js --apply
```

The supplied output reported:
- Eight indexes requiring creation.
- All eight indexes created.
- Post-migration verification passed.

Independent `mongosh` inspection subsequently confirmed:

| Collection | Index count excluding `_id_` |
|---|---:|
| `expected_submissions` | 3 |
| `metric_submissions` | 3 |
| `submission_policies` | 2 |
| **Total** | **8** |

The `users` collection was separately verified to contain its unique `email_1` index, in addition to `_id_`.

**Important distinction:** This provisioning occurred on the local development database at port 27017. It was not the integration database at port 27018 and was not production provisioning.

The standalone development database does not provide the replica-set topology required by the transaction-backed read workflow.

## 11. Combined regression verification

On 2026-11-17, the following combined regression command was executed:

```powershell
node --test `
  .\test\daily-submission-infrastructure-verification.test.js `
  .\test\daily-submission-infrastructure-verification-integration.test.js `
  .\test\daily-submission-readiness.test.js `
  .\test\read-transaction.test.js `
  .\test\daily-submission-read-transaction-integration.test.js `
  .\test\daily-submissions-api.test.js `
  .\test\daily-submission-read-request-validation.test.js
```

**Observed result:**

```text
tests 90
pass 90
fail 0
cancelled 0
skipped 0
todo 0
```

### Test breakdown

| Area | Passed |
|---|---:|
| Infrastructure verifier — unit tests | 13/13 |
| Infrastructure verifier — real integration test | 1/1 |
| Daily-submission readiness | 9/9 |
| Transaction runner — unit tests | 8/8 |
| Transaction integration | 6/6 |
| API/controller regression | 37/37 |
| Request validation | 16/16 |
| **Total** | **90/90** |

The API tests emitted expected authentication warning messages during negative test scenarios. The corresponding tests passed.

### Transaction runner hardening

The transaction runner now has explicit error-handling behaviour for session lifecycle failures.

The verified policy is:

- Session creation failure preserves the original error.
- Cleanup-only failure propagates the cleanup error.
- If both the transaction operation and session cleanup fail, the operation error remains primary and the cleanup error is retained separately as `cleanupError`.
- Session cleanup is attempted in the `finally` path.

The unit tests cover these error scenarios. The real integration tests cover transaction execution, session binding, abort behaviour and session cleanup.

## 12. Daily-submission readiness and API activation status

The existing readiness predicate is:

`src/services/dailySubmissionReadiness.js`

It is synchronous and performs no database operations.

It checks:
- Connection readiness.
- Exact registration of `User`.
- Exact registration of `ExpectedSubmission`.
- Exact registration of `MetricSubmission`.

It does not independently check topology, transaction capability or database indexes.

The new infrastructure verifier performs those separate infrastructure checks.

The application composition still explicitly sets:

```js
enableSelfServiceReads: false
```

Therefore the daily-submission API remains disabled for production-style composition.

The following operations remain disabled:

- GET `/api/daily-submissions/me/current`
- GET `/api/daily-submissions/me/:reportingDate`
- GET `/api/daily-submissions/me/history`
- POST `/api/daily-submissions`
- GET `/api/daily-submissions/:submissionId`

The default controller retains `501 NOT_IMPLEMENTED` stubs where applicable.

Passing readiness or infrastructure tests does not activate these endpoints or authorize their activation.

## 13. Query and index audit supporting evidence

Two UTF-16 LE search-result extracts were inspected:

| File | Source references | Distinct source files |
|---|---:|---:|
| `model-query-audit.txt` | 1,131 | 45 |
| `model-query-audit(2).txt` | 299 | 13 |
| **Combined** | **1,430** | **49 distinct files** |

Nine source files overlap between the extracts.

The original extract includes references from controllers, routes, services, models, scripts and migrations.

The second extract includes model definitions, reporting-assignment services and provisioning/verification scripts.

These are complementary search-result extracts, not complete source-code copies or proof that every possible database consumer has been discovered.

SHA-256 identifiers:

- `model-query-audit.txt`: `72D1A837C0D03351689DCDF44B17868582952A26D01725248AE0FCFE9FC47159`
- `model-query-audit(2).txt`: `5996F12FC1D3039B69EF2D9D0403E546BCC2F6926C884F445E5D2CC55344FB16`

Both files are retained as separate evidence.

## 14. Query execution plan observations

Read-only explain checks were performed against the local development database.

Observed plans:

| Query pattern | Observation |
|---|---|
| Organization-wide date range | Used `expected_submission_date_status`, followed by FETCH and blocking SORT |
| Date-only query sorted by employee | Used the employee/date unique index with a residual date filter |
| Employee-specific date range | Used the employee/date unique index in reverse traversal without a separate SORT |
| Active policy effectivity | Used `submission_policy_effectivity` for active/effective-start-date filtering, with effective-end-date evaluated as a residual filter |

The collections were empty during these checks. The execution statistics therefore contained zero returned documents, keys and documents examined.

These observations establish plan selection, not real-world query performance.

An additional candidate organization-wide index `{ reportingDate: -1, employeeId: 1 }` was identified for future workload and explain evaluation. No index change is recommended solely from the empty-collection plans.

## 15. Source and working-tree hygiene

The following checks were performed:

- `git status --short` inspected.
- `git diff --stat` inspected.
- `git diff --check` initially identified trailing whitespace in `src/services/readTransaction.js:17`.
- The two trailing spaces were removed.
- A subsequent `git diff --check` reported no trailing-whitespace errors.

Git continued to display CRLF-to-LF warnings for several modified files. These are line-ending warnings, not remaining whitespace errors.

No staging, commits, resets, stashing or cleanup operations were performed.

---

# Part C — Current Assessment and Outstanding Work

## 16. Evidence status

| Area | Evidence status |
|---|---|
| Shutdown and lifecycle implementation | Unit and manual verification evidence available |
| Database connection lifecycle | Unit and manual verification evidence available |
| Transaction runner | Unit and real integration evidence available |
| Core model registration | Unit and real integration evidence available |
| Replica-set topology prerequisite | Real integration verification passed |
| Seven core integration indexes | Real integration verification passed |
| Eight daily-submission development indexes | Explicit migration and independent inspection passed |
| User email index | Independent local inspection passed |
| Read-only infrastructure verification | Unit and integration evidence available |
| API authentication and authorization regression | Tests passed; API remains disabled |
| Query-plan behaviour | Read-only plans inspected on empty local collections |
| Production MongoDB topology/version | Not verified |
| Production database identity | Not verified |
| Production index inventory | Not verified |
| Production transaction capability | Not verified |
| Production deployment readiness | Not established |

## 17. Remaining production prerequisites

Before any production activation decision:

1. Identify the approved production MongoDB environment without exposing credentials.
2. Verify production MongoDB version and topology.
3. Confirm transaction capability in an approved representative non-production environment.
4. Verify the required production index inventory using read-only inspection.
5. Evaluate query plans and performance against representative data and expected workload.
6. Verify the deployment environment and serverless compatibility requirements.
7. Complete operational monitoring, logging, rollback and deployment sign-off.
8. Obtain separate explicit authorization before enabling daily-submission API operations.

The local standalone database must not be treated as a transaction-capable deployment target.

The one-member integration replica set proves the local integration topology prerequisite, not high availability or production resilience.

## 18. Final assessment

As of November 17, 2026, the daily-submission infrastructure has substantially stronger local verification evidence.

The transaction runner has been hardened and tested. The new infrastructure verifier correctly checks connection, model registration, topology and index definitions. Its integration test passed against the approved local replica-set environment and confirmed the seven core indexes without changing the index inventory.

The separate local development migration successfully provisioned and verified eight daily-submission indexes, while the User email index was independently confirmed.

The combined regression suite passed **90 out of 90 tests**.

These results establish local implementation and integration-test evidence. They do not establish production database readiness, production deployment compatibility or authorization to activate the daily-submission API.

**Current recommendation:** Preserve the completed verification work as a local infrastructure-hardening milestone. Keep the API disabled until production infrastructure verification and deployment approval are separately completed.

---

**Evidence boundary:** This document records the historical November 14 evidence and the November 17 user-supplied command outputs, source inspections and test results. It does not claim that production infrastructure was accessed or verified.