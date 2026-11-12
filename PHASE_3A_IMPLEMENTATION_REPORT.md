# Phase 3A Implementation Report — Database Models and Centralized Configuration

**Date:** 2026-11-11  
**Scope completed:** Phase 3A only  
**Status:** Implemented; offline unit suite passed

## Summary

Added the data-model foundation and a reusable, timezone-explicit policy/deadline service for daily submission accountability. Existing authentication fields and roles remain intact. The unused legacy Metrics model, ticket models/services, API contracts, scheduler, email workflow, Google Sheets and Power BI were not changed.

No production or other MongoDB database was connected. No collections were created, no data was seeded, and no employee/team/leave/holiday records were generated. No .env file or dependency manifest was modified. No dependencies were installed and no emails or spreadsheet operations were performed.

## Models created

- **MetricSubmission.js** — server-owned submission date/time/deadline/status fields, KPI validation, immutable punctuality evidence, unique employee/reporting-date index and query indexes.
- **ExpectedSubmission.js** — explicit expected/excluded employee-day state, reason code, policy/deadline snapshot, optional exception/submission references and unique employee/reporting-date index.
- **SubmissionAlert.js** — acknowledgement, resolution and delivery/retry state; unique idempotency key and lookup indexes.
- **SubmissionPolicy.js** — versioned deadline/timezone/working-weekday/effective-date policy. Defaults are 09:30, Asia/Kolkata and ISO weekdays Monday–Friday. Resolver fails closed if no policy or overlapping active policies match.
- **SubmissionException.js** — date-range Leave/Holiday/Exemption with approval state and approver evidence. Leave/exemption require an employee; approved records require approver and approval timestamp.
- **SubmissionCorrection.js** — correction request/history with modifying user, timestamp, reason, previous/corrected metric values, approval fields and immutable snapshots of original submitted timestamp, deadline and On-Time/Late status. No correction API was added.

## Existing model modified

- **User.js** — added migration-safe optional roster fields: active (default false), teamId, managerId, employmentStartDate and employmentEndDate. Existing name/email/password/role definitions remain. No team assignments, employee codes, or employment dates were invented. Existing login behavior does not use these new fields, and no existing user documents were saved or migrated.

The default false means future expected-day eligibility must wait for explicit roster activation; it does not change authentication. User._id remains the stable key. Optional employeeCode was not added because User._id suffices for this phase and no external employee-code source was provided.

## Deadline/configuration utility

- **submissionPolicyService.js** resolves the unique active policy effective for the requested business date, constructs a UTC instant for the policy's local deadline, classifies an injected server timestamp, and exposes an approved-exception/date-range helper for future reconciliation.
- **reportingDate.js** validates normalized YYYY-MM-DD business dates and HH:mm local times.
- Conversion uses Node's built-in Intl timezone support with the explicit configured IANA zone; it never uses host local timezone or browser time. Asia/Kolkata 09:30 resolves to 04:00 UTC. Equality is On-Time (submitted instant <= deadline instant). A clock function is injectable for deterministic tests.
- The backend already declares Mongoose; Node v24.19.0 provides the built-in test runner and Intl implementation. No package/dependency changes were required.

## Tests executed

Command:

~~~text
node --test "D:\Automated Accountability System\finalyear-backend\test\submission-foundation.test.js"
~~~

**Result: 18 passed, 0 failed.** Coverage includes required/invalid schema values, KPI integer/range/remarks constraints, expected/excluded status consistency, policy defaults and effective-date selection, overlap rejection, approved exception filtering, correction evidence immutability, alert idempotency index declaration, employee/date unique-index declaration, 09:00, 09:29, exactly 09:30 and 09:31 classifications, host timezone independence, and invalid date/time/zone rejection.

Tests ran offline against in-memory Mongoose documents and injected policy/clock fixtures. They did not connect to MongoDB. The repository has no configured test database and no local mongod executable was available, so actual database enforcement of unique indexes and concurrent duplicate inserts was not exercised. Index definitions themselves were asserted from each Mongoose schema. This limitation is not represented as a passing database integration test.

## Known limitations / deferred work

- No submission or correction API exists yet. Future route/service code must derive employeeId from authenticated User, set actualSubmittedAt from server time, omit client-controlled timestamps/status, and persist before external integrations.
- No SubmissionPolicy document was seeded; there is no database connection in this phase. Policy defaults exist in the schema, but deployment/bootstrap must create a reviewed version before resolving policies.
- No ExpectedSubmission generation, scheduler, alert creation/delivery, email, Sheets sync, Power BI or frontend workflow was implemented.
- Team assignments, manager relationships, active roster, effective employment dates, holiday source and approved exceptions remain unpopulated until authorized source data is supplied.
- Mongoose immutable fields protect persisted records from ordinary document updates but are not a substitute for API authorization, correction workflow, or database-level audit controls.
- Overlapping active policy ranges are rejected by the resolver, but no policy-management API or cross-document overlap write guard exists in Phase 3A.
- Unique indexes are declared but must be built and verified in an isolated non-production MongoDB environment before relying on them operationally.

## Files modified or created

**Modified**

- finalyear-backend/src/models/User.js

**Created**

- finalyear-backend/src/models/MetricSubmission.js
- finalyear-backend/src/models/ExpectedSubmission.js
- finalyear-backend/src/models/SubmissionAlert.js
- finalyear-backend/src/models/SubmissionPolicy.js
- finalyear-backend/src/models/SubmissionException.js
- finalyear-backend/src/models/SubmissionCorrection.js
- finalyear-backend/src/utils/reportingDate.js
- finalyear-backend/src/services/submissionPolicyService.js
- finalyear-backend/test/submission-foundation.test.js
- PHASE_3A_IMPLEMENTATION_REPORT.md

**Not modified:** ticket models/services/alerts, existing API routes/contracts, frontend, package manifests, .env files, DAILY_SUBMISSION_AUDIT.md, DAILY_SUBMISSION_IMPLEMENTATION_PLAN.md, databases and spreadsheets.

## Phase gate

Phase 3A is complete. No Phase 3B or later work has started. Awaiting explicit approval before adding submission APIs.
