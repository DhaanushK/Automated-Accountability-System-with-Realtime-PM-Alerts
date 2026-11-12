# Phase 3B.3B — Guarded Test Infrastructure Report

**Project:** Automated Accountability System with Real-Time PM Alerts  
**Completion date:** 2026-11-11  
**Scope:** Test-only infrastructure. No MongoDB connection was opened and no application persistence was enabled.

## 1. Files created and modified

Created:

- `finalyear-backend/test/support/mongoIntegration.js` — fixed test target, pre-connect URI validation, connection and replica verification, verified-connection gate, allowlisted cleanup, and connection lifecycle helpers.
- `finalyear-backend/test/support/fixtures.js` — explicit synthetic User, SubmissionPolicy, and ExpectedSubmission fixture creators guarded by verified connection identity.
- `finalyear-backend/test/guarded-mongo-support.test.js` — offline safety tests using mocked Mongoose clients.
- `PHASE_3B_3B_GUARDED_TEST_INFRASTRUCTURE_REPORT.md` — this report.

No application source, models, routes, middleware, package files, `.env` files, or MongoDB configuration were modified. The Phase 3B.1 POST handler remains unchanged and returns `501 NOT_IMPLEMENTED`.

## 2. Connection strategy

The existing application models register on Mongoose's default connection. The support uses a fresh, dedicated Node test process and the default Mongoose instance, connected only when `setupIntegrationDatabase()` is explicitly called. It does not introduce `createConnection()`.

The support module imports only Mongoose. It does not import `src/server.js`, application configuration, dotenv, startup modules, scheduler/alert initialization, email services, or Google Sheets integrations. The fixture module imports only the User, SubmissionPolicy, and ExpectedSubmission models and performs no creation during module import.

The approved target is fixed in source:

- Host: `127.0.0.1`
- Port: `27018`
- Replica set: `accountabilityTestRS`
- Application integration database: `accountability_app_integration_test`
- Existing transaction probe database (explicitly excluded): `accountability_transaction_test`

The integration database name is distinct from the transaction probe database. This phase did not create or connect to either database.

## 3. Pre-connect guard design

`validateIntegrationTarget()` parses the proposed target before any `connect()` call. It rejects:

- Any protocol other than `mongodb:`.
- Hostnames other than exactly `127.0.0.1`.
- Ports other than exactly `27018`.
- Database names other than exactly `accountability_app_integration_test` (therefore also rejecting the probe database and app defaults).
- Usernames, passwords, or any `@` user-info marker.
- Fragments.
- Any URI option other than exactly one `replicaSet=accountabilityTestRS` option.

The support does not read `process.env.MONGO_URI`, generic URI variables, `.env`, or app configuration. Connection options are passed separately with bounded `serverSelectionTimeoutMS` and `connectTimeoutMS`; automatic index creation is disabled. A failed validation does not call `connect()` or perform cleanup. If the default Mongoose connection is already open, setup fails closed instead of reusing it.

The offline suite sets `MONGO_URI` to a deliberately unapproved value and verifies that setup still passes the fixed in-source test URI to its mocked client. The URI is never printed.

## 4. Post-connect verification design

After the explicit connection attempt, setup checks the active Mongoose connection's host, port, database name, and ready state. It then runs MongoDB's `hello` command and requires:

- `setName` exactly `accountabilityTestRS`.
- The connected node to report itself as writable primary.
- Reported `me`/`primary` identity, when present, to equal `127.0.0.1:27018`.
- The advertised replica-set host list, when present, to contain exactly the approved single local member.

The connection is marked verified only after these checks pass. Any post-connect verification failure attempts to disconnect and returns a sanitized error without logging a URI. Cleanup and fixture helpers require that exact connection to be in the verified-connection registry and still match the approved address/database.

The post-connect verification implementation was tested only with mocks in this phase. The approved MongoDB instance was not contacted.

## 5. Collection cleanup allowlist

`INTEGRATION_COLLECTION_ALLOWLIST` is fixed to:

- `users`
- `submission_policies`
- `expected_submissions`
- `metric_submissions`

Cleanup runs `deleteMany({})` only after successful connection verification, against these collections only. It never calls `dropDatabase()`, drops collections, or drops indexes. The transaction probe collection/database and all application/production databases are outside the allowlist and rejected by the exact target guard. Cleanup preserves indexes.

The offline tests verify that cleanup before connection verification performs zero collection operations, and that verified cleanup enumerates only the allowlisted collection names.

## 6. Fixture strategy

Fixture functions are explicit exports and run only when called; importing the module does not create documents. Each function checks that its model uses the verified integration connection before it can call `.create()`.

- `createTestUser()` uses a reserved `.invalid` email, synthetic name/team, test-only password marker, and test dates. It is not a real roster identity or assignment.
- `createTestSubmissionPolicy()` uses a clearly named test-only policy version and test policy dates/default business values.
- `createTestExpectedSubmission()` requires an explicit employee ID, reporting date, deadline and policy version.

No real employee, roster assignment, policy document, or expected-day record was created. No fixture function was invoked during this phase.

## 7. Connection lifecycle

`setupIntegrationDatabase()` validates before connecting and disconnects on connection or verification failure. `teardownIntegrationDatabase()` clears verified status and disconnects an open Mongoose connection. `withIntegrationDatabase(callback)` wraps setup, gated allowlisted cleanup, the callback, and teardown in `try/finally`; teardown runs even when the callback throws.

The offline suite verified that a failed target guard does not call connect, that invalid identity prevents cleanup, and that teardown is called after a simulated callback failure. No actual connection lifecycle was exercised against MongoDB.

## 8. Offline test results

Only this explicitly named file was executed:

`node --test test/guarded-mongo-support.test.js`

**Result: 15 passed, 0 failed.** The tests use mocked client/connection objects and do not connect to MongoDB or external services. They cover:

1. Approved target accepted.
2. Wrong hostname rejected.
3. Wrong port rejected.
4. Wrong database rejected.
5. Wrong replica-set name rejected.
6. Credentials rejected, including empty user-info syntax.
7. Unexpected URI options rejected.
8. Failed target guard prevents connection.
9. Unverified connection prevents cleanup.
10. `MONGO_URI` cannot override the fixed test target.
11. Wrong replica-set identity is rejected and disconnected.
12. Unexpected replica-set members are rejected and disconnected.
13. Verified cleanup uses only the allowlist and excludes the probe collection.
14. Fixture helpers refuse to write before connection verification.
15. The `withIntegrationDatabase` wrapper closes after callback failure.

No application database integration test, model index initialization, application test suite, external integration, or unrestricted Node test discovery was run.

## 9. Security assessment

- Target constants are local and fixed; no production credentials or connection strings are read or logged.
- Host, port, database, replica-set name, member identity and single-member topology are guarded before cleanup can be reached.
- Cleanup is collection-allowlisted, uses `deleteMany`, and preserves indexes.
- Fixtures are synthetic and gated behind successful target verification.
- Test support avoids app startup, legacy email/Sheets, schedulers and alerts.
- `MONGO_URI` is not consulted by support code; it is used only as a negative offline test input and is not disclosed.

The harness is test-only code, not a security boundary against someone deliberately rewriting or bypassing the test support. Review changes to fixed constants, URI validation, verification, allowlists, or fixture gates before use.

## 10. Remaining limitations

- No connection to `127.0.0.1:27018` was attempted, so actual application-database target reachability, replica identity and cleanup behavior remain unverified in this phase.
- `accountability_app_integration_test` was not created. Application integration tests remain prohibited until separately authorized.
- No model index initialization or actual `listIndexes()` verification occurred.
- No application transaction, rollback, duplicate, concurrency, retry, unknown commit, or session-propagation test was implemented or executed.
- The correction validation hook still resolves User through `mongoose.model("User")`; with the chosen default-connection strategy this will use the isolated default connection in the dedicated test process. Do not switch to `createConnection()` without connection-aware model/service wiring and corresponding hook handling.
- The current model schemas declare unique indexes, but live indexes and existing duplicate records are unknown.
- Production topology and production transaction support remain unverified. The successful local probe does not prove production readiness.

## 11. Go/No-Go recommendation for application integration testing

**NO-GO for application database integration tests for now.** The offline guard and lifecycle checks pass, but the real approved endpoint was intentionally not contacted, the dedicated application integration database does not yet exist, and model indexes and app transaction behavior have not been verified.

The next approved step may provision/use the isolated target and run explicitly named application integration tests only after separate authorization. The test must confirm the live target identity before fixture cleanup. This infrastructure does not implement or enable submission persistence; the POST endpoint must remain at `501 NOT_IMPLEMENTED`.

### Restrictions confirmation

No MongoDB connection or database operation was performed. No test database was created, no fixture was seeded, and no model index initialization ran. No application test or external integration was executed. No `.env`, application source/configuration, package manifest, production configuration, Google Sheets, email, scheduler, or alert workflow was modified. Only the requested test support files, explicitly named offline test file, and report were created; the application POST handler remains disabled.
