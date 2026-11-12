# Daily Submission Accountability — Phase 1 Repository Audit

**Audit date:** 2026-11-11
**Scope:** Read-only review of the current backend, frontend, configured Google Sheet metadata, and checked-in workbook. No application source, configuration, or spreadsheet data was changed. No runtime tests were run.

## Executive summary

The repository has a metrics-shaped API that appends daily values to Google Sheets, role-based JWT authentication, a best-effort event logger, manual reminder email flows, and a scheduled ticket-alert system. It does **not** currently implement authoritative daily-submission accountability: no server-controlled submission timestamp, 9:30 AM deadline classification, expected employee-day schedule, automated missing-submission detection, or submission-specific PM alerts were found.

| Area | Audit result |
| --- | --- |
| Metrics submission API | Partial: date and metric values are appended to Sheets, but no actual submission time or deadline status is stored. |
| Frontend submission form | Not integrated: the component named `MetricsSubmissionForm` edits ticket status; no frontend caller for `POST /api/metrics/submit` was found. |
| MongoDB metrics persistence | Not active: `Metrics.js` exists, but no source imports or writes to the model. |
| Authentication and identity | JWT and role data exist; metrics submission is gated by a hard-coded email allowlist and exact name-to-tab matching. |
| Google Sheets | Current configured spreadsheet is ticket-level A:M data. The metrics API and legacy service expect a different A:I row layout. |
| Event logging | Submission events are designed to create `Event_Logs` with a timestamp, but logging is best-effort and the configured spreadsheet currently has no such tab. |
| Scheduled alerts | Existing cron jobs analyze ticket/SLA conditions, not missing daily metric submissions. Metrics reminder emails are manually addressed. |

## Findings

### 1. Metrics API stores reporting dates, not submission punctuality

`finalyear-backend/src/server.js` mounts the route module at `/api/metrics` (line 91). The submission endpoint is `POST /api/metrics/submit` (`finalyear-backend/src/routes/metricsRoutes.js`, lines 274–280). It reads `date`, tickets assigned/resolved, SLA breaches, reopened tickets, client interactions, and remarks (lines 289–312), finds a sheet by exact `user.name` equality (lines 314–323), then appends a row to `A:I` (lines 326–328).

The route does not create or persist `actualSubmittedAt`, calculate a deadline, classify On-Time/Late, detect Missing/Pending, or check for a duplicate employee/date before appending. It requires a reporting date through `DateValidator.validateDateForTeamLead`; that middleware limits which reporting dates can be entered (lines 131–188 of `finalyear-backend/src/middleware/dateValidation.js`) but does not enforce a clock-time cutoff. The separate `PUT /api/metrics/update` route searches for a row by date and overwrites it (`metricsRoutes.js`, lines 95–100 and 135–185); this is an edit flow, not an authoritative submission history.

### 2. The MongoDB `Metrics` model is unused

`finalyear-backend/src/models/Metrics.js` defines `user`, `date`, the operational metric fields, and `status` with only `On-Time`/`Late` values (lines 3–17). A repository-wide source search found no imports or model writes outside the model declaration. The submission route writes to Google Sheets and does not use Mongoose `Metrics`. The default `On-Time` value therefore does not show that deadline classification is implemented; there is no code setting it based on a submission timestamp.

The `User` model is also not linked from a `Metrics` record in practice. Its role enum is `team_member`, `team_lead`, or `project_manager` (`finalyear-backend/src/models/User.js`, lines 3–8).

### 3. The named frontend form is a ticket editor, not a daily metrics form

`finalyear-frontend/src/components/MetricsSubmissionForm.jsx` loads `/api/tickets/incomplete` (lines 16–24) and sends `PATCH /api/tickets/update-status` with a ticket ID and new status (lines 38–45). `finalyear-frontend/src/pages/LeadDashboard.jsx` renders this component (lines 4 and 50). A repository-wide search found no frontend call to `/api/metrics/submit`.

The application does have metrics/performance views, but the current `/api/metrics/user` handler returns ticket data through `getMemberTicketData` (`metricsRoutes.js`, lines 363–415), and `/api/metrics/all` returns ticket data through `getAllTeamTicketData` (lines 443–477). The older `userSheetsService.js` expects metrics rows in `A2:I` (lines 76 and 294), but its functions are imported in `metricsRoutes.js` without being used by the active `/user` or `/all` handlers.

### 4. Authentication exists; employee-to-sheet mapping is name-coupled

`POST /api/auth/login` compares the submitted password with the stored bcrypt hash and signs a JWT (`finalyear-backend/src/routes/authRoutes.js`, lines 22–99). `authMiddleware` verifies the bearer token and reloads the user's current name, email, and role from MongoDB (`finalyear-backend/src/middleware/auth.js`, lines 5–35).

Metrics submission then applies `APPROVED_EMAILS` in `metricsRoutes.js` (lines 54–85). The allowlist contains the project manager and team-member addresses; their values are intentionally not reproduced here. The route does not trust a client-supplied employee ID: it uses the authenticated user record. However, it maps that user to a Google Sheet by exact display-name/tab-name equality (lines 318–323), and the ticket read path similarly requests data by `user.name` (`metricsRoutes.js`, lines 397–404). The sheet schema has no stable employee ID column in the ticket dataset. The `User` schema has no active flag, team assignment, leave, holiday, or exception fields, so the repository does not currently define an expected employee-day roster. Actual MongoDB user records were not queried for this source audit.

### 5. Google Sheets currently has ticket rows and a competing metrics layout

The code uses the same `GOOGLE_SPREADSHEET_ID` for the metrics append/update flow and the ticket services. Ticket services read each employee tab as `A2:M` (`finalyear-backend/src/services/ticketSheetsService.js`, lines 52–75); the expected fields are ticket number, created date, severity, SLA hours/deadline, status, assignment fields, resolution date, carry-forward, days forwarded, remarks, and urgency score. `ticketAnalysisService.js` reads the same A:M structure (lines 36–43).

By contrast, `POST /api/metrics/submit` appends date/name/email and daily KPI values to `A:I` in the same user-named tab. Unless a separate spreadsheet configuration exists outside the source, using this route against the current spreadsheet would mix two incompatible row layouts in the same employee tab. This is a material integration risk; no separate daily-metrics spreadsheet ID was found in the active routes/services.

A read-only metadata/header check of the configured Google spreadsheet on the audit date found **six tabs and 120 ticket rows**. All tabs use the ticket-level schema, with minor header drift: `Created Date` vs. `Created_Date`, one `Reamrks` typo, and one leading space in `SLA_Deadline`. There is no `Event_Logs` tab in that spreadsheet at the time of the check. The checked-in `New Data (New Repo).xlsx` likewise contains per-employee ticket sheets, not daily submission timestamps.

### 6. Event logs have timestamps but are not a submission record of authority

`finalyear-backend/src/services/eventLogger.js` is configured to create and append to an `Event_Logs` sheet (lines 4–6, 22–41, and 109–160). It formats a timestamp using `Asia/Kolkata` and `toLocaleString('en-IN')` (lines 54–70). The metrics route calls it **after** the Google Sheets append (metricsRoutes.js, lines 328–347), so its timestamp is generated after the write and is not stored on the submitted row. It is a locale-formatted audit string, not a canonical submission timestamp/deadline pair.

Logging failures are caught and return `false` without throwing (`eventLogger.js`, lines 44–48), and the submission endpoint does not check the return value. Thus a successful submission response does not guarantee a log entry. The configured spreadsheet currently lacks `Event_Logs`, so there are no current audit rows there to analyze.

### 7. Existing scheduled alerts are ticket/SLA alerts; submission reminders are manual

`finalyear-backend/src/schedulers/alertScheduler.js` schedules analysis at 9:00 AM and 5:00 PM daily, plus Monday at 10:00 AM, using `Asia/Kolkata` (lines 7–44). Each job invokes `alertNotificationService.analyzeAndSendAlerts()`; that service calls `analyzeTicketsForDefaulters()` (`finalyear-backend/src/services/alertNotificationService.js`, lines 43–54). The analyzer reads ticket rows and flags open overdue tickets, reopened/escalated tickets, and high/critical open tickets (`finalyear-backend/src/services/ticketAnalysisService.js`, lines 61–120 and 124–154). It does not query daily metric submissions or compare submission time with 9:30 AM.

The automated alert email is addressed to the identified employee (`alertNotificationService.js`, lines 149–163); alert records are persisted separately. No submission-specific PM alert flow was found. The PM “Metrics Reminder” UI asks the PM to select recipients manually (`finalyear-frontend/src/components/ProjectManagerEmailDashboard.jsx`, lines 157–179 and 212–218; selection UI at lines 717–768). The backend route accepts that supplied `missingSubmissions` list and sends those reminders (`finalyear-backend/src/routes/projectManagerEmailRoutes.js`, lines 169–204). The team-lead reminder flow also accepts a manually selected list (`teamLeaderEmailRoutes.js`, lines 733–890). These are outbound reminder tools, not automatic missing-submission detection.

## Phase 1 conclusion

**The daily submission accountability objective is not implemented in the current source.** Related components exist, but they cover different parts of the problem: a Google Sheets append endpoint for KPI values, ticket analytics, best-effort activity logging, manual reminder email screens, and scheduled ticket/SLA alerts.

The core missing data and logic are an authoritative server-side submission instant, a configured deadline comparison, an expected employee/reporting-date roster (including working days and exceptions), persisted Pending/Missing states, idempotent submission-specific alerts, and an employee-facing daily metrics form connected to the API.

## Phase 2 risks to preserve

- Do not use the ticket A:M tabs as the daily submission table; the active readers and writers expect incompatible schemas.
- Do not treat `Metrics.status` defaults or `Event_Logs` timestamps as proof of punctuality.
- Preserve the existing ticket-alert scheduler and ticket-based dashboards; they are separate workflows.
- Decide whether the current `/api/metrics/submit` API contract is a legacy route to preserve, adapt, or retire before connecting a new form.
- Use authenticated user identity and stable user IDs for any new authoritative submission record; avoid name-only tab matching as the data key.

**Phase gate:** This document completes Phase 1 only. No Phase 2 plan or implementation has been started.
