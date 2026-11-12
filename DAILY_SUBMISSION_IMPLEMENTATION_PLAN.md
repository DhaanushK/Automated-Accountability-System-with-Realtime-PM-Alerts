# Daily Submission Accountability — Technical Architecture and Implementation Plan

**Project:** Automated Accountability System for Daily Metrics Submission with Real-Time PM Alerts
**Phase:** 2 — architecture and planning only  
**Date:** 2026-11-11  
**Status:** Proposed; implementation has not started

## 1. Executive Summary

Phase 1 found related functionality but not daily submission accountability. POST /api/metrics/submit writes reporting dates/KPIs to Google Sheets but does not capture an authoritative submission instant, compare against 09:30 IST, or identify expected employee-days. The component MetricsSubmissionForm edits ticket status and does not call that endpoint. Existing scheduled alerts analyze tickets/SLA; PM/TL reminder forms require manually selected recipients.

This plan adds a separate workflow in the MERN application. React provides employee submission and manager accountability views. Express uses existing JWT authentication, validates inputs and writes a server-timestamped MetricSubmission to MongoDB. A separate ExpectedSubmission exists for each eligible employee/day. An independent scheduler reconciles expected days with actual submissions and creates idempotent SubmissionAlert records. Email and reporting synchronization run asynchronously. A separately configured reporting spreadsheet feeds Power BI; the existing ticket spreadsheet remains untouched.

MongoDB is authoritative. The server compares a UTC submission instant to the applicable deadline constructed for the reporting date in Asia/Kolkata. At or before 09:30 is On-Time; after is Late. Pending, Missing and Excluded belong to the expected-day state. The plan recommends a new submission model, materialized expected-day records, central versioned business policy, an additive API during compatibility transition, and an outbox for retryable external reporting/notifications.

The final workflow should let employees submit and review their state/history, authorized managers review team/organization accountability, automatically detect missing submissions, recover after restarts, deliver deduplicated alerts, safely sync analytical data, and provide Power BI facts separate from ticket performance.

## 2. Current Architecture and Gap Analysis

| Component | Existing implementation | Gap | Proposed enhancement |
|---|---|---|---|
| MongoDB models | finalyear-backend/src/models/User.js defines name/email/password/role. finalyear-backend/src/models/Metrics.js exists but is unused; status only On-Time/Late. | No active submission, expected-day or submission-alert record. | Add MetricSubmission, ExpectedSubmission, SubmissionAlert, policy and outbox models. Keep Metrics untouched pending consumer review. |
| Metrics API | finalyear-backend/src/routes/metricsRoutes.js writes A:I to Sheets; finalyear-backend/src/server.js mounts /api/metrics. | No actual timestamp/deadline/status, idempotency or duplicate employee/date protection. Update endpoint overwrites sheet rows. | Add new Mongo-backed daily-submissions API; preserve old route during consumer inventory. |
| Frontend | finalyear-frontend/src/components/MetricsSubmissionForm.jsx loads incomplete tickets and PATCHes ticket status; finalyear-frontend/src/pages/LeadDashboard.jsx renders it. | No employee daily submission form or frontend caller to /api/metrics/submit. | Add separate employee form and manager accountability pages; preserve ticket UI. |
| Authentication | finalyear-backend/src/middleware/auth.js verifies JWT and reloads current user/role. | No eligibility or team-scope rule. | Preserve JWT; derive identity from authenticated User ID; enforce team scope on backend. |
| Employee mapping | metricsRoutes.js uses hard-coded email allowlist and exact user.name/tab-name matching. User has no active/team attributes. | Names/emails are brittle keys; no roster/manager hierarchy. | Use User._id; add active/effective dates/team/manager as needed; replace allowlist with eligibility policy. |
| Google Sheets | ticketSheetsService.js and ticketAnalysisService.js read ticket A:M. metricsRoutes.js appends metrics A:I to a same-name tab using the same configured ID. | Incompatible row layouts can collide. | Keep ticket worksheets unchanged; use a distinct reporting spreadsheet. |
| Event logging | finalyear-backend/src/services/eventLogger.js creates Event_Logs and timestamps in IST; metrics route calls after sheet write and ignores failure. | Best-effort event log is not submission truth or guaranteed delivery evidence. | Keep for general activity; store submission/alert truth in MongoDB. |
| Scheduler/alerts | finalyear-backend/src/schedulers/alertScheduler.js runs ticket checks at 9AM, 5PM and Monday 10AM IST; alertNotificationService analyzes tickets. | No missing metrics evaluation; process-local cron can miss runs. | Add separate scheduler with persisted catch-up reconciliation. Preserve ticket alert jobs. |
| Email | Ticket alerts and manual PM/TL reminder routes exist; manual routes accept recipient lists. | No automated submission alert based on expected/submitted records. | Add alert/outbox worker, recipient policy, retry state and test sink. |
| PM dashboard | finalyear-frontend/src/components/ProjectManagerEmailDashboard.jsx supports manual reminders and ticket analytics. | No submission accountability overview. | Add separate status/alert overview and drilldown. |
| TL dashboard | LeadDashboard and TeamLeaderEmailDashboard are ticket and manual-reminder workflows. | No team-scoped submission view. | Add team submission view with server-enforced scope. |
| Power BI | No Power BI integration found in inspected source. | No stable analytical schema. | Provide normalized employee/date/ticket/submission/expected/alert facts via reporting layer. |

**Evidence paths:** POST route: finalyear-backend/src/routes/metricsRoutes.js:274–354; route mounting: finalyear-backend/src/server.js:88–95; ticket form behavior: finalyear-frontend/src/components/MetricsSubmissionForm.jsx:1–45; schemas: finalyear-backend/src/models/User.js:3–8 and finalyear-backend/src/models/Metrics.js:3–17; auth: finalyear-backend/src/middleware/auth.js:5–54. These reviewed source references agree with the Phase 1 audit; no material discrepancy was found.

## 3. Proposed System Architecture

~~~mermaid
flowchart LR
  UI[Employee and Manager React UIs] --> API[Express API]
  API --> Auth[JWT + role/team authorization]
  Auth --> Services[Submission and Expected-Day Services]
  Services --> DB[(MongoDB authoritative store)]
  Scheduler[Submission reconciliation scheduler] --> Services
  Services --> Alerts[Alert evaluator + idempotency]
  Alerts --> DB
  Alerts --> EmailWorker[Email outbox worker]
  Services --> Sync[Reporting sync outbox]
  Sync --> Sheet[(Dedicated reporting spreadsheet)]
  Sheet --> BI[Power BI semantic model]
  TicketServices[Existing ticket services] --> TicketSheet[(Existing ticket A:M data)]
  TicketCron[Existing ticket/SLA scheduler] --> TicketServices
  TicketServices --> BI
~~~

React collects data and displays the persisted result; it never calculates punctuality. Express validates, authenticates and authorizes. MongoDB is the system of record. Submission service enforces employee/date uniqueness and captures server time. Expected-day service generates roster/calendar records. Scheduler recovers unresolved rows and evaluates deadline state. Alert/email workers persist before delivery and retry independently. Google sync exports normalized facts to a separate destination. Power BI analyzes facts through shared dimensions; ticket operations remain independent.

## 4. Database Design

### 4.1 User / Employee

The existing User fields are sufficient for authentication. Reuse User._id as the stable submission foreign key; do not duplicate name/email/password/role. Add, migration-safely, active, teamId, managerId, optional unique employeeCode for external reporting, and employment effective dates. Existing accounts must be explicitly roster-reviewed before being eligible. Keep leave and holiday history in dated exception/calendar records, not user booleans. Shared Asia/Kolkata timezone does not require per-user timezone.

### 4.2 MetricSubmission

Proposed Mongoose record:

~~~js
{
  _id: ObjectId,
  employeeId: ObjectId,             // ref User; server derives from JWT
  reportingDate: "YYYY-MM-DD",      // Asia/Kolkata business date
  actualSubmittedAt: Date,          // server-created UTC instant
  applicableDeadlineAt: Date,       // resolved UTC instant
  status: "On-Time" | "Late",
  metrics: {
    ticketsAssigned: Number,
    ticketsResolved: Number,
    slaBreaches: Number,
    reopenedTickets: Number,
    clientInteractions: Number,
    remarks: String
  },
  policyVersion: String,
  requestIdempotencyKey: String,
  createdAt: Date,
  updatedAt: Date
}
~~~

Validate nonnegative integer counts, bounded remarks, required dates and known fields. Reject client-supplied employeeId, timestamp, deadline, status or policy. Use schema timestamps. Add unique compound index employeeId + reportingDate; read indexes reportingDate + status and employeeId + reportingDate descending. Same idempotency key replays return the original result; a distinct second submission returns 409 until an authorized correction policy exists. Corrections must retain original punctuality evidence. Persist to Mongo before external sync. Use transactions only if deployment supports them; otherwise use unique keys and an outbox plus reconciliation.

### 4.3 ExpectedSubmission

Materialize expected days so an employee-day remains visible even with no actual submission.

~~~js
{
  _id: ObjectId,
  employeeId: ObjectId,
  reportingDate: "YYYY-MM-DD",
  expected: Boolean,
  status: "Pending" | "On-Time" | "Late" | "Missing" | "Excluded",
  deadlineAt: Date,
  policyVersion: String,
  reasonCode: String,                // WORKDAY, WEEKEND, HOLIDAY, LEAVE, EXEMPTION
  exceptionId: ObjectId | null,
  submissionId: ObjectId | null,
  statusEvaluatedAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
~~~

Use unique employeeId + reportingDate, plus query indexes on reportingDate/status and status/deadlineAt. Materialize exclusions with reason codes for dashboard explanation; exclude them from expected denominators. Generate a configurable forward horizon (recommended 30 days) from active roster, employment dates, calendar and approved exceptions. Reconcile/upsert unresolved rows daily. Policy changes affect future rows; historical corrections require audit actor/reason. Submission links by employeeId/reportingDate; overdue no-submission becomes Missing.

### 4.4 SubmissionAlert

Fields: _id, employeeId, reportingDate, expectedSubmissionId, optional submissionId, alertType (MISSING/LATE_RECEIVED/MANAGER_DIGEST), triggerTimestamp, recipientUserId, restricted recipient snapshot, acknowledgementStatus/acknowledgedAt, resolutionStatus/resolvedAt, deliveryStatus, attempts, error code, idempotencyKey, timestamps. Unique idempotencyKey should derive from expected record + alert type + recipient (or manager digest/date). Index by date/resolution, recipient/acknowledgement and delivery/next-attempt. Create before delivery; retries update the same alert. Late arrival resolves and retains the Missing alert; optional late notice is a separate policy decision.

### 4.5 Configuration

Use an effective-dated ApplicationSetting/SubmissionPolicy for deadlineLocalTime (default 09:30), timezone, working days, holiday calendar, generation horizon, evaluator cron and recipient/escalation rules. Snapshot policy version and resolved deadline on expected rows. Environment variables are for deployment secrets/endpoints only (Mongo, JWT, mail, dedicated reporting spreadsheet ID, development sink). Environment values bootstrap a fresh environment; MongoDB policy is the centralized editable business rule. No secrets in source or plan.

For a demo, configure a short evaluator interval and a near-term dev deadline or inject a fake clock. Keep production default 09:30 IST. Never wait for morning/evening cron to test.

## 5. Submission Lifecycle and Business Logic

1. Employee authenticates with existing JWT.
2. UI loads expected date, deadline, current state and prior submission.
3. Server derives employeeId from req.user.id and checks active roster and expected record.
4. Validate eligible reporting date; reject future/non-expected dates.
5. Validate KPI values; reject client-supplied identity, timestamp, deadline/status/policy.
6. Capture server time once, resolve policy deadline for the reporting date and convert to UTC.
7. Classify On-Time iff actualSubmittedAt <= deadline; exactly 09:30 is On-Time.
8. Insert unique MetricSubmission; update ExpectedSubmission and enqueue outbox work.
9. Persist alert changes and sync jobs; external failures do not invalidate saved submission.
10. Return ID, date, server timestamp, deadline, status. UI localizes UTC instant for IST display.
11. Manager views query persisted expected/submission/alert records.

~~~mermaid
sequenceDiagram
 actor Employee
 participant UI as React Form
 participant API as Express API
 participant Auth as JWT Authorization
 participant Svc as Submission Service
 participant DB as MongoDB
 participant Outbox as Sync and Alert Outbox
 participant Worker as Reporting/Email Worker
 participant BI as Reporting Layer

 Employee->>UI: Enter daily metrics
 UI->>API: POST metrics + idempotency key
 API->>Auth: Verify token and current user
 Auth-->>API: Employee ID and role
 API->>Svc: Validate eligibility and payload
 Svc->>DB: Read expected record and policy
 DB-->>Svc: Deadline and policy version
 Svc->>Svc: Capture server time and classify
 Svc->>DB: Insert unique submission
 Svc->>DB: Update expected state and enqueue
 DB-->>Svc: Persisted canonical result
 Svc-->>UI: Timestamp, deadline and status
 Outbox-->>Worker: Retryable work
 Worker->>BI: Idempotent reporting upsert
~~~

Store BSON Date instants as UTC; reportingDate is a business calendar date in Asia/Kolkata. Use IANA timezone-aware conversion (backend package already lists moment-timezone) so host server timezone cannot shift the deadline. Client clock never controls classification. Client UUID idempotency keys plus the unique employee/date index handle retries and races. After timeout, replay same key or GET current state. External sync/email retries never roll back Mongo data.

## 6. Missing Submission Detection

Before deadline, expected/no-submission remains Pending. At or after deadline, evaluator joins expected records against submissions: absent becomes Missing and queues one MISSING alert; present becomes persisted On-Time/Late. Excluded remains excluded and never triggers an alert.

Run expected generation and evaluation on a configurable short interval. On startup after Mongo connects, catch up unresolved overdue records with bounded pagination, then continue scheduled runs. Persist transitions and unique alert keys before sending. Multiple instances may safely race using unique indexes and conditional updates; add a lease only if needed. A late submission after Missing transitions the expected row to Late, links the submission, resolves (but does not delete) the Missing alert and may enqueue a late notice. The persisted expected-day record, not the scheduler, is the basis for reconstructing state.

## 7. API Architecture

Add new /api/daily-submissions endpoints. Keep existing /api/metrics/submit and /update behavior during caller inventory. Phase 1 found no frontend caller, not that no external consumer exists. Do not repoint a legacy endpoint with a changed meaning until its consumers and spreadsheet side effects are reviewed; later deprecate with notice or provide an explicit compatibility adapter.

| Method / path | Roles | Contract |
|---|---|---|
| GET /api/daily-submissions/me/current | Team Member | Optional reportingDate; returns eligibility, date, deadline, status and existing submission. |
| POST /api/daily-submissions | Team Member | KPI fields + Idempotency-Key; returns canonical persisted result; reject supplied employee/time/status. Errors 400/401/403/409/422. |
| GET /api/daily-submissions/me | Team Member | Bounded date range/page; own history only. |
| GET /api/daily-submissions/:id | Owner, in-scope TL, PM | Detail with role-filtered fields; inaccessible record returns 404/403. |
| GET /api/submission-accountability/team | TL, PM | Date/range and optional team; server scopes rows and aggregates. |
| GET /api/submission-accountability/overview | PM | Date/status filters and aggregate/detailed views. |
| GET /api/expected-submissions | TL in scope, PM | Date range, status, team; paginated expected/excluded rows. |
| GET /api/submission-alerts | Recipient, TL in scope, PM | Authorized alert history and delivery/acknowledgment state. |
| PATCH /api/submission-alerts/:id/acknowledgement | Recipient or authorized manager | Acknowledge only; cannot alter delivery or submission status. |
| POST /api/submission-exceptions (optional) | Explicitly authorized approver | Employee/date/type/reason; requires approval/audit policy. Current roles do not define an admin. |

Use stable error codes (NOT_EXPECTED, ALREADY_SUBMITTED, OUT_OF_WINDOW, INVALID_METRIC); paginate and bound date ranges. Authorization predicates must be part of backend queries, not UI filtering.

## 8. Role-Based Access Control

| Role | Proposed access |
|---|---|
| Team Member | Submit own eligible metrics, view own state/history/alerts; no other employee private records. |
| Team Lead | View expected/submitted states and history only for assigned team; acknowledge team alerts if policy permits; cannot change actual time/status. |
| Project Manager | View authorized organization records, aggregates and alerts; manage policy only if explicitly granted. |
| Worker | Internal reconciliation/delivery identity only; no browser role. |

Use existing JWT authentication and current database role reload. Add backend middleware that loads active/team/manager scope. User._id is identity; no client-supplied employee or team value grants access. Replace the hard-coded APPROVED_EMAILS check with explicit active roster/role eligibility. Team scope must be tied to persisted membership. Roster mapping is a prerequisite.

## 9. Frontend Architecture

Add finalyear-frontend/src/components/DailyMetricsSubmission.jsx and a small API module using the existing axios convention (finalyear-frontend/src/config/axios). Integrate a separate submission panel/tab into the Team Member dashboard selected by the existing role routing; do not insert it into the Team Lead ticket status editor.

The component loads expected date, eligibility, deadline and prior state; displays date/deadline in Asia/Kolkata; validates nonnegative integer counts and remark length; submits an idempotency key; disables repeated clicks; preserves form values after network errors; displays the server-returned timestamp/status; and shows history and an already-submitted state. No edit action until correction policy is decided. Handle loading, excluded, unauthorized, validation, duplicate and retry states accessibly. Server validation is authoritative.

Add distinct Team Lead and PM views using existing visual conventions: team-scoped table, PM aggregate/date/status filters, drill-down and alert history. Do not redesign ticket pages or label ticket metrics as submission metrics.

## 10. Scheduler and Notification Architecture

Add a submission scheduler initialized after Mongo connects in finalyear-backend/src/server.js alongside the existing initializeAlertScheduler. It must have its own task handles and stop behavior. The current alertScheduler.stopAlertScheduler iterates all cron tasks; future scheduler lifecycle changes must avoid stopping unrelated jobs.

Flow: generate expected days → evaluate due rows → persist transitions and alert outbox → deliver queued notifications → record attempts/result. Scheduler interval is configurable and separate from the business deadline. Use bounded exponential retry and visible Failed state. Development uses a fake mail transport/preview sink; no real emails during testing.

The current ticket/SLA scheduler remains unchanged. New scheduler only evaluates expected/submission records. Existing PM/TL manual reminder forms remain separate during rollout and are not automatic detection. Resolve recipients from persisted manager hierarchy/policy and snapshot recipient at alert creation; decide immediate PM alerts versus digest before enabling.

## 11. Google Sheets Synchronization

**Recommendation: a separately configured reporting spreadsheet.** MongoDB remains authoritative for submission timestamps, statuses, exceptions and alert states. A dedicated spreadsheet avoids the A:M ticket vs A:I metrics conflict and reduces risk to current ticket data.

Suggested normalized tabs:

- **Submissions:** submissionId, employeeId, employeeCode, reportingDate, actualSubmittedAtUtc, deadlineAtUtc, status, KPI values, policyVersion, updatedAt.
- **ExpectedSubmissions:** expectedSubmissionId, employeeId, reportingDate, expected, status, deadlineAtUtc, reasonCode, submissionId, updatedAt.
- **SubmissionAlerts:** alertId, employeeId, reportingDate, alertType, triggerTimestampUtc, recipientKey, acknowledgment/resolution/delivery state.
- **Employees:** stable employeeId/code, displayName, teamId and effective active dates; limit personal fields.

Use a distinct REPORTING_SPREADSHEET_ID and never reuse the ticket spreadsheet ID or employee tabs. Enqueue an outbox item on authoritative changes. Upsert by immutable row key or replace a staging tab from a consistent export; append alone is not idempotent. Retry transient errors and persist attempt/error/sync state in Mongo. Periodically reconcile keys/counts/watermarks and repair omissions/duplicates. Sync failure never rejects or erases a saved submission. Do not migrate historical rows unless provenance is verified; they cannot yield trustworthy submission instants.

## 12. Power BI Data Architecture

No Power BI integration was found in inspected source. Initially import from the dedicated normalized spreadsheet; at scale consider a governed SQL/Fabric warehouse without changing Mongo authority. Application views use the API for immediate state; imported Power BI refresh is not real-time and should display last refresh time.

| Table | Grain/key | Relationships |
|---|---|---|
| DimEmployee | One row per stable employee key. | Employee key to facts; do not key by name/email. |
| DimDate | One row per calendar date; workday/holiday attributes. | Reporting date to facts. |
| FactTicket | One row at existing ticket/lifecycle grain. | Employee and relevant date roles; SLA remains here. |
| FactSubmission | One row per actual submission, status, actual/deadline instants and KPI values. | Employee and reporting date; optional role date for actual submission. |
| FactExpectedSubmission | One row per employee/reporting day, including excluded if materialized. | Employee/date; denominator includes expected only. |
| FactAlert | One row per logical alert and its trigger/resolution/delivery state. | Employee/date and expected/submission keys. |

Use one-to-many dimensions, single-direction filters by default and role-playing date relationships (reporting, actual submission, alert trigger dates). Never directly join FactTicket to FactSubmission; compare through DimEmployee and DimDate. Convert UTC instants for IST presentation.

Suggested DAX definitions; every measure depends on newly implemented facts, not existing ticket data:

~~~DAX
Expected Submissions :=
CALCULATE(COUNTROWS(FactExpectedSubmission), FactExpectedSubmission[Expected] = TRUE())

On-Time Submissions :=
CALCULATE(DISTINCTCOUNT(FactSubmission[SubmissionKey]), FactSubmission[Status] = "On-Time")

Late Submissions :=
CALCULATE(DISTINCTCOUNT(FactSubmission[SubmissionKey]), FactSubmission[Status] = "Late")

Missing Submissions :=
CALCULATE(COUNTROWS(FactExpectedSubmission), FactExpectedSubmission[Expected] = TRUE(),
          FactExpectedSubmission[Status] = "Missing")

Pending Submissions :=
CALCULATE(COUNTROWS(FactExpectedSubmission), FactExpectedSubmission[Expected] = TRUE(),
          FactExpectedSubmission[Status] = "Pending")

Excluded Submissions :=
CALCULATE(COUNTROWS(FactExpectedSubmission), FactExpectedSubmission[Expected] = FALSE())

On-Time Submission Rate := DIVIDE([On-Time Submissions], [Expected Submissions])
Late Submission Rate := DIVIDE([Late Submissions], [Expected Submissions])
Missing Submission Rate := DIVIDE([Missing Submissions], [Expected Submissions])
Submission Coverage :=
DIVIDE([On-Time Submissions] + [Late Submissions], [Expected Submissions])
~~~

Rates use expected employee-days; exclusions are excluded from denominator. Pending remains in denominator for current periods and is shown separately. A finalized-period measure may omit Pending only after a finalization policy is defined.

## 13. Testing Strategy

Use isolated fixtures, controlled timestamps and fake email/Sheets transports. Do not wait for real time to reach 09:30. Test configuration may use a short deadline/interval without changing production defaults.

| Test | Controlled setup/input | Expected result | Area |
|---|---|---|---|
| On-Time | Expected day; fake now 09:29:59 IST. | Persist once as On-Time with server UTC timestamp. | API/service |
| Exactly 09:30 | Fake now equals deadline. | On-Time because comparison is <=. | Deadline utility |
| Late | Fake now 09:30:01. | Persist Late. | Service |
| Missing | No submission; fake now past deadline; run evaluator. | Missing and one logical alert. | Evaluator |
| Pending | No submission; fake now before deadline. | Remains Pending, no alert. | Evaluator |
| Weekend | Calendar marks nonworking. | Excluded/WEEKEND, outside denominator, no alert. | Generator |
| Approved leave | Approved exception overlaps date. | Excluded with reason/reference. | Exception/generator |
| Duplicate | Same employee/date, replay same and different keys. | Same key returns original; different key 409; one record. | API/index |
| Unauthorized | Member requests another employee; TL requests outside team. | Denied without record leakage. | RBAC |
| Timezone | Host timezone differs from IST. | Same 09:30 IST deadline instant and business date. | Date utility |
| Sheets failure | Mongo succeeds, reporting adapter fails. | Submission success; retryable outbox; retry is idempotent. | Sync worker |
| Alert idempotency | Re-evaluate overdue row concurrently. | One logical alert and delivery job. | Alert model |
| Scheduler restart | Overdue Pending row exists on startup. | Catch-up marks Missing and queues one alert. | Scheduler |
| Late after Missing | Missing alert exists; late submit arrives after cutoff. | State Late; old alert resolved/retained. | Service/alerts |
| Concurrent submit | Two requests race for one employee/date. | Unique index allows one; other conflicts unless same idempotent request. | Mongo/API |
| Policy update | New deadline effective for future days. | Future rows use new version; history unchanged absent audited correction. | Config |
| Spoofed timestamp | Client includes status/time/deadline. | Reject/ignore server-owned fields; no manipulation. | Validation |
| Email safety | Test worker processes alert. | Fake sink only; no real provider call. | Notifications |

## 14. Migration and Backward Compatibility

1. Inventory callers of POST /api/metrics/submit and PUT /api/metrics/update; no frontend caller was found, but external callers remain unknown.
2. Add new models/indexes without dropping/renaming Metrics. Keep existing User accounts valid while adding roster fields.
3. Map current accounts explicitly to stable User IDs, teams, active dates and managers; do not infer from names/sheet tabs.
4. Run new API/UI in parallel; leave legacy routes explicit until approved migration.
5. Create a separate reporting spreadsheet; leave ticket A:M tabs and current ticket workflows unchanged.
6. Never fabricate historical submissions. Ticket rows, event logs and legacy A:I values cannot establish a submission instant. Start trustworthy analytics at a stated go-live date; prior data is unavailable, not Missing.
7. Preserve current ticket dashboards, ticket alerts and manual reminders; add clearly labeled accountability views.
8. Rollback additively by disabling new routes/scheduler/UI/email while retaining records. Never delete submission/alert history. Use independent flags for scheduler, UI/API and outbound mail.

## 15. Implementation Roadmap

Future work only; no stage has started.

| Stage | Objective and files | Dependencies/deliverables | Verification and risk |
|---|---|---|---|
| 3A — Data/config | Add models under finalyear-backend/src/models/; extend User only after roster decisions; add policy/deadline service under src/services/. | Decide roster, calendar, exceptions and edit policy. Deliver schemas, indexes and bootstrap policy. | Isolated Mongo validation/index checks. Risk: unassigned existing users. |
| 3B — Submission API | Add routes/services under finalyear-backend/src/routes/ and src/services/; mount in src/server.js; retain metricsRoutes legacy semantics. | 3A complete. Deliver submit/current/history APIs. | Fake-clock boundary, auth and duplicate tests. Risk: unknown legacy callers. |
| 3C — Expected scheduling | Add generator/evaluator under src/services/ and scheduler under src/schedulers/; initialize after DB connect. | Calendar/roster rules. Deliver horizon and catch-up. | Restart, holiday, leave, uniqueness and multi-instance tests. |
| 3D — Employee UI | Add DailyMetricsSubmission.jsx and API integration under finalyear-frontend/src/components/ and established API module convention. | API stable. Deliver form, status, history and retry UX. | Validation/auth/conflict/network verification. |
| 3E — Manager UI | Add separate TL/PM components/pages and scoped APIs. | Membership/hierarchy policy. Deliver filters, aggregates, drilldown. | Cross-team denial and aggregate correctness. |
| 3F — Alerts/email | Add submission alert/outbox service and templates, separate from ticket alert service. | Recipient rules and fake transport. | Idempotency/retry tests; ensure no real dev email. |
| 3G — Sheets | Add dedicated reporting adapter/worker/reconciliation; distinct reporting ID. | Spreadsheet schema/access. | Failure/retry and proof ticket spreadsheet remains untouched. |
| 3H — Verification/Power BI | Add tests, runbook and model/measures. | Prior stages and approved representative data. | Integration coverage for time, concurrency, restart, access and DAX. Risk: refresh/licensing limits. |

Review each stage before proceeding. A demo can set a short evaluator interval and near-term development deadline without enabling email.

## 16. Risks, Dependencies and Open Decisions

| Decision | Why it matters | Recommended default | Alternative consequence |
|---|---|---|---|
| Active roster/stable ID? | Expected days need reliable identity. | User._id plus explicit active dates and approved mapping. | External employeeCode must map uniquely to User._id. |
| Team/manager ownership? | TL access and PM alert routing. | Persist teamId/managerId or historical membership. | Manual recipients undermine automation. |
| Working days/holiday owner? | Expected vs Excluded correctness. | Versioned central calendar. | Missing holidays create false alerts. |
| Leave source/approver? | Exclusions must be auditable. | Audited restricted exception workflow initially; HR integration later. | Without it, only known weekends/holidays excluded. |
| Can users edit after submission/deadline? | Affects record integrity. | One submission; authorized correction preserves original instant and records actor/reason. | In-place edits can hide original metrics. |
| Are late submissions accepted? | Determines Missing transition. | Accept; Missing becomes Late and prior alert resolves, not deletes. | Rejecting late data leaves incomplete operational record. |
| Who gets alerts? | Privacy and volume. | Employee + direct manager; PM digest by default, confirm before email. | Immediate PM-per-person alerts may be noisy. |
| Historical demo data? | Synthetic data can be mistaken as evidence. | Clearly labeled isolated test fixtures only; go-live date for real metrics. | Never import samples to production. |
| Legacy metrics endpoints? | External callers may depend on Sheets writes. | Preserve pending inventory; new route in parallel. | Reuse without migration risks schema/contract breakage. |
| Meaning of “real-time”? | Defines cadence. | Minute-level evaluation plus startup catch-up; show delivery state. | Longer intervals delay; push requires another transport. |
| Mongo topology? | Transactions depend on replica set. | Unique constraints/outbox; use transaction only after confirming topology. | Standalone requires reconciliation. |
| Power BI refresh/hosting? | Refresh and embedding depend on licensing. | Import dedicated report layer; show refresh time; assess warehouse later. | Near-live requires extra capacity/gateway/security. |
| Retention/access policy? | Employee performance data is sensitive. | Decide retention and minimize exported personal fields before production. | Longer retention increases privacy burden. |

**High-risk integration points:** (1) same-sheet schema collision: distinct reporting destination is mandatory; (2) roster/identity fields are absent and eligibility cannot be guessed; (3) no frontend caller does not rule out external legacy consumers; (4) all deadline logic must use IST business dates and UTC instants; (5) overlapping schedulers need persisted transitions and unique alerts; (6) email delivery cannot be guaranteed exactly once after a provider timeout; (7) Power BI import is not real-time; (8) no historical submission timestamps can be reconstructed from ticket rows, event logs or legacy metrics rows.

## Executive Checklist

- [x] Summary and current-gap analysis
- [x] Existing/proposed distinctions and source paths
- [x] Architecture and Mermaid diagrams
- [x] User, submission, expected-day, alert and configuration designs
- [x] Lifecycle, deadline rules, retries and missing recovery
- [x] API contracts and role permissions
- [x] Frontend and scheduler/notification design
- [x] Separate Google Sheets reporting architecture
- [x] Power BI schema and measure definitions
- [x] Controlled-time testing matrix
- [x] Migration, roadmap, risks and open decisions
- [x] Planning-only boundary maintained
