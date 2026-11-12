# Phase 3B.4 — Application-Level MongoDB Integration Test Report

**Date:** 2026-11-11  
**Overall status: BLOCKED — do not treat this phase as a PASS.** The guarded database and application indexes were verified and synthetic fixtures were cleaned, but the application submission write service is absent, so the required end-to-end transaction scenarios could not be tested. A collection outside the authorized cleanup allowlist also appeared in the database inventory; no operation was performed on that collection after it was observed.

## Exact verified database identity

Connected only through `test/support/mongoIntegration.js` and its `setupIntegrationDatabase()` helper. The helper's URI guard and MongoDB `hello` verification passed:

| Check | Observed |
|---|---|
| Host | `127.0.0.1` |
| Port | `27018` |
| Database | `accountability_app_integration_test` |
| Replica set | `accountabilityTestRS` |
| Writable primary | `true` |
| Connected member | `127.0.0.1:27018` |
| Primary member | `127.0.0.1:27018` |
| Advertised members | Exactly `127.0.0.1:27018` |

Port `27017`, `accountability_transaction_test`, application/production connection strings, `.env`, application startup, and external integrations were not used.

## Live index verification

Before index operations, the guarded helper cleaned only its approved four-collection allowlist. The test compared each model's declared keys, name, and uniqueness with `listIndexes()` in the authorized database. Missing declarations were created from the reviewed model schemas with `createIndex`; no index was dropped or changed. All expected indexes were present afterward and no index creation failure or mismatch was reported.

| Model / collection | Model-declared indexes verified after creation |
|---|---|
| User / `users` | `email_1` — `{ email: 1 }`, unique |
| SubmissionPolicy / `submission_policies` | `uniq_submission_policy_version` — `{ policyVersion: 1 }`, unique; `submission_policy_effectivity` — `{ active: 1, effectiveStartDate: 1, effectiveEndDate: 1 }` |
| ExpectedSubmission / `expected_submissions` | `uniq_expected_submission_employee_date` — `{ employeeId: 1, reportingDate: 1 }`, unique; `expected_submission_date_status` — `{ reportingDate: 1, status: 1 }`; `expected_submission_due_status` — `{ status: 1, deadlineAt: 1 }` |
| MetricSubmission / `metric_submissions` | `uniq_metric_submission_employee_date` — `{ employeeId: 1, reportingDate: 1 }`, unique; `metric_submission_date_status` — `{ reportingDate: 1, status: 1 }`; `metric_submission_employee_history` — `{ employeeId: 1, reportingDate: -1 }` |

The live collections also reported their standard MongoDB `_id_` indexes. No correction, alert, or exception model indexes were requested or created. Index creation was confined to the four authorized model collections in the dedicated test database.

## Synthetic fixtures and cleanup

Created through the guarded fixture helpers after target verification:

- 1 synthetic User with an explicit test-only ObjectId, `.invalid` email, and test-only team/date values.
- 1 test SubmissionPolicy (`phase3b4-integration-test-v1`) for the fixed reporting date.
- 1 expected employee-day with the saved deadline `2026-11-12T04:00:00.000Z` and the test policy version.
- 0 MetricSubmission records.

The fixture test verified the expected employee/date, Pending state, null submission reference, saved deadline, and policy version. In `finally`, cleanup used only `cleanupIntegrationCollections()` and deleted 1 User, 1 SubmissionPolicy, 1 ExpectedSubmission, and 0 MetricSubmissions. Counts afterward were zero for all four allowlisted model collections. No fixture document remains in those collections.

## Test scenario results

The required integration file was run explicitly:

`node --test test/daily-submission-integration.test.js`

The final run reported **3 passed, 0 failed, 6 skipped**. The integration test file also ran once earlier while being refined; both runs used only the guarded target.

| Scenario | Result | Evidence / limitation |
|---|---|---|
| Index and fixture lifecycle | **PASS** | Target verified; all declared User, policy, expected-day, and metric indexes present; synthetic records created and cleaned. |
| A. Successful application submission | **BLOCKED** | `dailySubmissionService.js` contains validators/readiness/error helpers only; it has no submission write function. Controller continues to return 501. |
| B. Atomic rollback through application service | **BLOCKED** | No application transaction service exists to invoke. No substitute test-only service was used. |
| C. Duplicate conflict behavior through application service | **BLOCKED** | Unique MetricSubmission employee/date index is present, but application duplicate mapping/replay behavior is absent and untested. |
| D. Concurrent application submissions | **BLOCKED** | No application write service exists; concurrency through the service was not tested. |
| E. Transaction retry and stable captured timestamp | **BLOCKED** | No application transaction callback/timestamp capture exists to test. |
| F. Unknown commit result reconciliation | **NOT TESTED** | Not safely simulated; no service or controlled failpoint is available. |
| G. ExpectedSubmission status/reference consistency | **PASS (model validation only)** | Valid On-Time with reference accepted; Late without reference and Pending with reference rejected. This does not test a service transition. |
| H. Deadline snapshot/equality/late/correction evidence | **PASS (utility/model check only)** | Fixed saved deadline classified equality as On-Time and +1 ms as Late; correction model immutability check preserved original timing/status in memory. This does not test persisted correction behavior. |

### Offline regressions

Only the explicitly named files required by the task were run:

- `node --test test/submission-foundation.test.js` — **26 passed, 0 failed**.
- `node --test test/daily-submissions-api.test.js` — **10 passed, 0 failed**.
- `node --test test/guarded-mongo-support.test.js` — **16 passed, 0 failed**.

No broad test discovery, application startup, external integration, scheduler, alert, email, or Google Sheets test was run.

## Collection allowlist deviation — action stopped

The final post-cleanup inventory in the authorized database also showed a `submission_corrections` collection. This collection is outside the four-collection cleanup allowlist. The integration test imported and hydrated `SubmissionCorrection` for the in-memory punctuality-evidence assertion; no correction document was inserted, and no correction index was created. The appearance of the collection was unexpected; its cause was not investigated.

After observing it, no operation was performed on `submission_corrections`: it was not inspected further, cleaned, dropped, or indexed. The four approved collections were confirmed empty and the connection was closed. This deviation is unresolved and prevents an overall PASS. Do not expand the cleanup allowlist or modify this collection without separate authorization.

## Transaction, cleanup, and connection evidence

- Database transaction commit/rollback behavior was previously verified only by the separate transaction probe report; this Phase 3B.4 run did not exercise an application transaction.
- All four application model index declarations were confirmed live in the dedicated test database.
- Allowed fixture cleanup completed and the four allowlisted model collections were empty afterward.
- The integration harness reported `connectionClosed: true` after teardown.
- No index or collection was dropped.

## Failures, skipped tests, and unresolved risks

- **Critical blocker:** there is no application submission write engine; POST remains `501 NOT_IMPLEMENTED`.
- **Critical blocker:** scenarios A–E are blocked and F is not tested; transaction atomicity, rollback, duplicate mapping, concurrency, retry, and uncertain commit handling have no application-level evidence.
- **Safety deviation:** `submission_corrections` appeared outside the cleanup allowlist. It was left untouched; its cause and contents remain unknown.
- ExpectedSubmission and punctuality checks passed only at model/utility level, not through persistence service behavior.
- Passing index verification and offline regression suites do not compensate for the missing write service or skipped transaction scenarios.

## Production and external-system confirmation

No production database or configured application database was accessed; only the explicitly authorized isolated integration-test database was accessed. No `.env` value was read. No Google Sheets, email, scheduler, alert, or external integration was invoked. No legacy route or application source was modified. The Phase 3B.1 POST handler remains disabled with `501 NOT_IMPLEMENTED`.

**Recommendation:** keep application submission persistence disabled. Resolve the collection-allowlist deviation and implement/approve the actual write service before rerunning A–F against the guarded integration database. Do not run broad test discovery.