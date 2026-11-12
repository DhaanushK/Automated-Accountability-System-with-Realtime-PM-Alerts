# Phase 3A.1 Hardening Report

**Date:** 2026-11-11  
**Scope:** Phase 3A.1 foundation hardening only  
**Result:** Implemented; offline suite passed

## Changes implemented

- **ExpectedSubmission consistency:** Pending, Missing and Excluded states reject a submissionId; On-Time and Late require a castable ObjectId reference. Existing expected/excluded and reason-code rules remain. The schema cannot prove that the referenced MetricSubmission document exists without a database lookup; the future submission/reconciliation service must maintain that relationship.
- **Employee-isolated exceptions:** The policy helper now requires a target employee. Approved Leave and Exemption apply only when their employeeId matches that target. A global Holiday with no employeeId applies to any supplied eligible employee; an employee-scoped Holiday applies only to its employee. Pending/rejected or out-of-range exceptions do not apply.
- **Correction safeguards:** correctionReason is immutable after creation. Existing immutable snapshots of actualSubmittedAt, applicableDeadlineAt and On-Time/Late status remain. A correction cannot be approved by its modifier. Approval validation looks up the approver's current User role and accepts only team_lead or project_manager; a missing user or other role fails closed.
- **Timezone behavior:** For the configured local deadline, a time mapping to zero instants (DST spring-forward gap) or multiple instants (DST fall-back fold) is rejected. The system does not silently choose an earlier/later fold occurrence. Asia/Kolkata 09:30 resolves to 04:00 UTC and classifies equality as On-Time.
- **No API or workflow expansion:** No correction API, submission API, scheduler, frontend, notification, Sheets, or ticket workflow was added or changed.

## Files inspected

- DAILY_SUBMISSION_AUDIT.md
- DAILY_SUBMISSION_IMPLEMENTATION_PLAN.md
- finalyear-backend/package.json
- finalyear-backend/src/models/User.js
- finalyear-backend/src/models/Metrics.js
- finalyear-backend/src/models/MetricSubmission.js
- finalyear-backend/src/models/ExpectedSubmission.js
- finalyear-backend/src/models/SubmissionPolicy.js
- finalyear-backend/src/models/SubmissionException.js
- finalyear-backend/src/models/SubmissionCorrection.js
- finalyear-backend/src/utils/reportingDate.js
- finalyear-backend/src/services/submissionPolicyService.js
- finalyear-backend/test/submission-foundation.test.js

## Files modified

- finalyear-backend/src/models/ExpectedSubmission.js
- finalyear-backend/src/models/SubmissionCorrection.js
- finalyear-backend/src/services/submissionPolicyService.js
- finalyear-backend/test/submission-foundation.test.js

## File created

- PHASE_3A_1_HARDENING_REPORT.md

No other files were modified for Phase 3A.1. No dependency manifest or .env file was changed.

## Tests added

The existing submission-foundation.test.js suite was extended with cases covering:

- Submission reference required for On-Time/Late and forbidden for Pending/Missing/Excluded.
- Invalid ObjectId handling.
- Employee A's approved Leave and Exemption do not exclude Employee B.
- Approved global holidays apply to both employees; employee-scoped holidays do not cross employees.
- Exception evaluation requires a target employee.
- Correction reason and original punctuality evidence remain immutable after hydration.
- Self-approval rejection.
- Team Member approver rejection and Team Lead approver acceptance using a mocked User lookup.
- DST fall-back ambiguity rejection and spring-forward nonexistent-time rejection.
- Asia/Kolkata deadline remains 09:30 IST / 04:00 UTC.

## Test execution

Executed the complete offline foundation suite:

~~~text
node --test "D:\Automated Accountability System\finalyear-backend\test\submission-foundation.test.js"
~~~

**Result: 26 tests, 26 passed, 0 failed, 0 skipped.**

All tests ran without connecting to MongoDB. Approver-role behavior was tested with a mocked User lookup. Exception isolation used distinct in-memory ObjectIds; no employee assignments or records were created.

## Remaining limitations

- A syntactically valid submissionId is required for submitted states, but actual cross-collection existence is not checked in schema validation. That check belongs in the future service/reconciliation path.
- The approver role guard checks current role but cannot enforce Team Lead team scope without the future authorization service and roster assignments.
- Mongoose document validation is not a substitute for authorization on future API routes or protection against direct database writes.
- No live database unique-index enforcement, transactions, or concurrency behavior was tested. The suite remains offline as required.
- There is no exception source data, active employee roster, manager mapping, or policy seed. None was invented.
- Ambiguous and nonexistent local deadlines fail closed; a future business decision could instead choose a specific fold policy, but this implementation intentionally does not.
- Phase 3B API work remains unstarted.

## Safety confirmation

No production or other MongoDB instance was connected or modified. No employee, manager, holiday or leave records were created. No Google Sheets, email workflow, .env file, dependency manifest, ticket model, route, service, scheduler or alert logic was modified. No submission API, correction API, scheduler or frontend component was added.

**Phase gate:** Phase 3A.1 is complete. Waiting for explicit approval before Phase 3B.
