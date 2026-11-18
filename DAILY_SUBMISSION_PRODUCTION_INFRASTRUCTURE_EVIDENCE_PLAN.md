# Daily Submission Production Infrastructure Evidence Plan

**Date:** 2026-11-14  
**Purpose:** Plan collection and review of production-readiness evidence. This is a planning document; no verification procedure below was executed.

## 1. Executive summary

The application has a local guarded read-transaction verification record, but the production MongoDB environment is unidentified in the available evidence. Production topology, version, target database, indexes, transaction capability, and operational ownership remain unknown. This plan defines how responsible owners can collect that evidence without disclosing credentials or making unapproved database changes.

No production or non-production database is designated here. A deployment target must be explicitly identified and approved before any connection or verification. All approval gates below begin **Not assessed**; none is passed by this plan.

The three self-service GET routes, POST submission, and submission detail remain disabled. Production composition explicitly sets `enableSelfServiceReads: false`; nothing in this plan changes that state.

## 2. Current verified baseline

The following are verified from source or existing project evidence, not inferred production facts:

- `finalyear-backend/src/services/readTransaction.js` uses the application's default Mongoose connection, creates a session, runs `withTransaction()` with primary read preference and snapshot read concern, and ends the session in `finally`. It has no nontransactional fallback.
- `finalyear-backend/src/services/dailySubmissionReadiness.js` checks connection readiness and registration of User, ExpectedSubmission, and MetricSubmission on the same connection. Its check is synchronous and does not prove transaction capability or live index state.
- `finalyear-backend/src/server.js` uses the daily-submission read service with `enableSelfServiceReads: false`.
- The Step 6 evidence document records a supplied Step 5C local guarded test result of six passed, including the actual read-service scenario and read-transaction abort scenario. This is local test evidence only; it is not production evidence.
- The guarded test helper has a fixed local target and cleanup allowlist. Those local test constants do not identify production.

No hosting provider, production URI, production database name, production topology, or production MongoDB version is assumed in this plan.

## 3. Unknown production infrastructure facts

The following remain unknown until evidence is provided by the relevant owners:

- Intended production and staging environments and their hosting platforms.
- Backend deployment location and its network path to MongoDB.
- MongoDB hosting provider, deployment type, replica-set/shard identity, members, and server version.
- The exact production database identity and how application credentials are managed.
- Current live definitions of required indexes and whether existing data would permit any future index operation.
- Production transaction capability and operational behavior under transient failures.
- Backup/recovery, monitoring, incident ownership, and release/change controls.

Evidence must be redacted: never retain connection strings, usernames/passwords, tokens, private keys, or sensitive employee data.

## 4. Workstream A — Deployment environment identification

Complete this inventory before any infrastructure check:

| Item | Evidence required | Acceptable source | Provider / approver | Read-only? | Current status |
|---|---|---|---|---|---|
| Intended environment | Named environment and purpose (staging, production, etc.) | Approved deployment inventory/change record | Release owner | Yes | Unknown |
| Hosting platform | Provider and project/tenant identifier, with secrets omitted | Platform inventory or console metadata | Infrastructure owner | Yes | Unknown |
| Backend location | Service/app identity, region, network/VPC/subnet and outbound route | Deployment manifest or platform metadata | Infrastructure owner | Yes | Unknown |
| MongoDB provider | Provider/cluster/project identity | Provider control-plane metadata | DBA/infrastructure owner | Yes | Unknown |
| Deployment type | Replica set, sharded cluster, or standalone | MongoDB topology metadata | DBA | Yes | Unknown |
| Environment separation | Distinct targets, credentials and network policies for dev/test/stage/prod | Architecture/deployment inventory | Security and infrastructure owners | Yes | Unknown |
| Network restrictions | Approved app-to-DB path, firewall/private endpoint and source restrictions | Network policy / security group metadata | Network owner | Yes | Unknown |
| Credential management | Secret-manager reference, rotation owner and least-privilege role; no secret value | Secret inventory metadata and access policy | Security owner | Yes | Unknown |
| Infrastructure ownership | Named responsible team and escalation route | Service ownership record | Project/release owner | Yes | Unknown |

**Collection rule:** identify targets from approved inventories and secret-manager references; do not guess hostnames, database names, or providers. Redact connection details before evidence is retained. If environment identity cannot be unambiguously established, stop without connecting.

## 5. Workstream B — MongoDB topology and version

### Read-only procedure for a separately approved target

1. Obtain written approval identifying the exact environment, cluster, database, check window, collector, and DBA owner. Do not ask for or include credential values in this report.
2. Have the DBA use an approved least-privilege administrative/read-only identity or provider metadata interface.
3. Record the server version from MongoDB build metadata (for example, `db.adminCommand({ buildInfo: 1 })`; retain only version and relevant nonsecret fields).
4. Inspect topology using `db.adminCommand({ hello: 1 })`. Record reported `setName`, `isWritablePrimary`, member/primary identity, and whether `msg` indicates a mongos router. Treat topology fields as metadata, not as evidence that an application transaction succeeded.
5. For a replica set, the DBA may use the read-only equivalent of replica-set status (for example, `db.adminCommand({ replSetGetStatus: 1 })`) to record member health and primary state. Use privileges approved by the DBA; do not make topology changes.
6. For a sharded deployment, obtain provider/DBA confirmation of the shard topology and supported transaction configuration, including required metadata services and shard participation. Do not infer suitability from `hello` alone.
7. Independently confirm that the inspected target is the intended environment and database using deployment inventory and redacted connection metadata. Do not disclose a URI.
8. Compare the evidence with the application’s required transaction design and the approved non-production test results. If topology is standalone, identity is ambiguous, or transaction support cannot be established, stop and mark the gate blocked.

### Interpretation and failure conditions

- A standalone deployment is not accepted for the multi-document transaction design.
- A reported replica-set or sharded topology is a prerequisite, not proof of correct app routing or successful transaction execution.
- A connected Mongoose state or a `hello` response alone does not prove the application can run its intended transaction.
- Version/topology outside documented MongoDB support, unhealthy members, no writable primary where required, or inability to identify the environment blocks further readiness assessment.
- Do not alter topology or increase permissions as part of verification.

### Access and evidence

The DBA/platform owner should provide metadata-only evidence with collection time, cluster/environment label, command/tool name, sanitized output, collector, and reviewer. Use the least privilege required by the chosen metadata interface. Never capture authentication material or raw connection strings.

## 6. Workstream C — Required index verification

### Index inventory from current model source

The schemas use fixed collection names. The following is the current declared inventory relevant to the design:

| Collection / model | Index | Name | Unique / partial | Role |
|---|---|---|---|---|
| `users` / User | `{ _id: 1 }` | `_id_` | Standard MongoDB unique identifier index; no partial filter | Required for authenticated User lookup by ID. MongoDB creates the standard _id index for collections. |
| `users` / User | `{ email: 1 }` | Mongoose-generated `email_1` unless named differently in deployed metadata | Unique via schema `unique: true`; no partial filter declared | Authentication/login identity constraint; not the primary query index for self-service reads. Record and verify as an application identity constraint. |
| `expected_submissions` / ExpectedSubmission | `{ employeeId: 1, reportingDate: 1 }` | `uniq_expected_submission_employee_date` | Unique; no partial filter declared | Required for own-day lookup and employee/date uniqueness; also supports the employee/date range history query. |
| `metric_submissions` / MetricSubmission | `{ employeeId: 1, reportingDate: 1 }` | `uniq_metric_submission_employee_date` | Unique; no partial filter declared | Required for submission lookup by employee/date and duplicate protection. |

Exact declared submission indexes are in `finalyear-backend/src/models/ExpectedSubmission.js` and `finalyear-backend/src/models/MetricSubmission.js`. User identity fields are in `finalyear-backend/src/models/User.js`. The default `_id_` index is database-provided, not an explicit schema declaration.

Additional declared indexes found in those model files:

| Collection | Key | Name | Classification for these three Team Member reads |
|---|---|---|---|
| `expected_submissions` | `{ reportingDate: 1, status: 1 }` | `expected_submission_date_status` | Operational/status query support; not required by the three self-service query shapes. |
| `expected_submissions` | `{ status: 1, deadlineAt: 1 }` | `expected_submission_due_status` | Due/missing-state processing support; not required by these reads. |
| `metric_submissions` | `{ reportingDate: 1, status: 1 }` | `metric_submission_date_status` | Reporting/status query support; not required by the three self-service query shapes. |
| `metric_submissions` | `{ employeeId: 1, reportingDate: -1 }` | `metric_submission_employee_history` | Potential history read performance index; the unique ascending employee/date index already supports the employee/date prefix and reverse date traversal. Record it, but treat as performance-oriented unless a query plan/SLO makes it mandatory. |

The backend's `scripts/migrations` contains migration programs for User employee-code, reporting-assignment, and submission-access-grant indexes. The inspected directory contains no dedicated migration for the ExpectedSubmission or MetricSubmission indexes listed above. The models declare the submission indexes. `src/config/db.js` currently sets `autoIndex: true`, but this is not evidence that production indexes exist or match the intended definitions; do not rely on it as verification.

### Read-only verification specification

For each target collection, have a DBA obtain index metadata using a read-only metadata operation (for example, `listIndexes` on that collection) against the explicitly approved database. Compare:

1. Exact collection name and database.
2. Exact index name.
3. Ordered key fields and directions.
4. `unique` value.
5. Partial filter, sparse, collation, TTL, hidden, and any other relevant options.
6. Whether an equivalent key exists under a different name or an incompatible index reuses the expected name.

Capture sanitized index metadata and a comparison result. Do not run a migration, create/rebuild/drop an index, or inspect unrelated collections. Any missing, duplicate, differently ordered, or incompatible required unique index blocks readiness. If duplicates might prevent a future index change, report that condition for a separately approved data-quality investigation; do not scan or repair records under this plan.

Historical local test-database index records are not production evidence.

## 7. Workstream D — Transaction capability

Use stages that separate topology claims from actual application behavior:

1. **Topology evidence:** Complete Workstream B for a designated non-production deployment. A suitable replica set or supported sharded topology is necessary, but not sufficient.
2. **Application configuration review:** Confirm the application uses the intended Mongoose default connection, and that models and `readTransaction.js` use that same connection. Review redacted configuration metadata without printing secrets.
3. **Non-production execution:** On an explicitly approved isolated non-production target, run the specifically authorized read-transaction test plan with synthetic fixtures. Verify session creation, primary/snapshot options, session-bound reads, commit of the read transaction, deliberate abort propagation, and session cleanup. The existing Step 5C local record is useful historical local evidence; it does not substitute for evidence from a separately selected representative environment.
4. **Write-test boundary:** Any future write-based transaction/atomicity test requires separate written authorization, a dedicated approved database, synthetic records, pre-registered ownership, reviewed cleanup, and an explicit command/run plan. No write test is authorized by this document.
5. **Operational behavior:** Review sanitized transaction error rates, retry behavior, and safe 503 handling in non-production. Confirm no sessionless fallback. Do not induce failures against production.

Failure to create sessions, start/commit/abort transactions as expected, preserve snapshot/session behavior, close sessions, or safely handle errors blocks progress. Do not silently downgrade to independent reads.

## 8. Workstream E — Deployment readiness gates

All gates start **Not assessed**.

| Gate | Entry criteria | Evidence and owner | Pass criteria | Failure response | Status |
|---|---|---|---|---|---|
| 1 — Environment identified | Project/service ownership available | Environment inventory; infrastructure and release owner | Intended target and owner are unambiguous; no secret disclosure | Stop; resolve target/ownership | Not assessed |
| 2 — Topology and version verified | Gate 1 passed | Sanitized server/topology metadata; DBA | Version/topology support intended transactions; healthy approved topology | Block; infrastructure remediation requires separate approval | Not assessed |
| 3 — Indexes verified | Exact target approved; Gate 1 passed | Read-only listIndexes comparison; DBA/deployment operator | Required definitions match exactly | Block; no automatic index change; plan separate remediation | Not assessed |
| 4 — Transaction capability verified | Approved isolated non-production target | Test run record and sanitized identity/options/results; application developer + DBA | Authorized transaction scenarios pass and cleanup is evidenced | Block; diagnose in non-production, no fallback | Not assessed |
| 5 — Application configuration reviewed | Gates 1–4 evidence available | Source/configuration review with secrets redacted; developer/security | Correct connection/model/transaction path, readiness and safe errors confirmed | Block and correct through separately approved change | Not assessed |
| 6 — Operational readiness | Technical gates passed | Monitoring, backup/recovery, access control, incident ownership; SRE/security/release owner | Monitoring and response owners accept documented controls | Block deployment readiness | Not assessed |
| 7 — Explicit activation authorization | Gates 1–6 reviewed | Separate release approval naming routes, environment, window, rollback owner | Explicit approval for a specific activation change | Keep endpoints disabled | Not assessed |

A gate is not passed merely because a checklist is complete. The referenced evidence must exist, identify the intended target, be dated, and have an accountable reviewer.

## 9. Evidence collection templates

### Environment and verification record

| Evidence item | Target environment | Source | Collection date/time (UTC) | Collector | Reviewer | Result | Evidence reference (redacted) | Approval status |
|---|---|---|---|---|---|---|---|---|
| Example: deployment identity | Unknown | To be supplied | — | — | — | Not collected | — | Not assessed |
| MongoDB topology/version | Unknown | To be supplied | — | — | — | Not collected | — | Not assessed |
| Application target review | Unknown | To be supplied | — | — | — | Not collected | — | Not assessed |

### Index comparison record

| Environment/database label | Collection | Expected name/key/options | Observed name/key/options | Match? | Metadata reference | DBA | Reviewer | Approval |
|---|---|---|---|---|---|---|---|---|
| Unknown | `expected_submissions` | `uniq_expected_submission_employee_date`; unique `{employeeId:1, reportingDate:1}`; no partial filter | Not collected | Not assessed | — | — | — | Not assessed |
| Unknown | `metric_submissions` | `uniq_metric_submission_employee_date`; unique `{employeeId:1, reportingDate:1}`; no partial filter | Not collected | Not assessed | — | — | — | Not assessed |
| Unknown | `users` | `_id_`; `{_id:1}` | Not collected | Not assessed | — | — | — | Not assessed |
| Unknown | `users` | Unique email identity index, model declares `email:1` unique | Not collected | Not assessed | — | — | — | Not assessed |

Do not fill unknown environment names, observed definitions, collectors, dates, or approvals by assumption.

## 10. Security and operational restrictions

- Use approved, least-privilege read-only access for metadata collection. Do not request credentials in planning documents.
- Never retain raw URIs, passwords, access tokens, keys, or private employee data.
- Do not connect to production until environment identity and written authorization are explicit.
- No index creation, repair, rebuild, drop, migration, or data cleanup in verification.
- Do not inspect or modify `submission_corrections`.
- Any isolated integration test that creates synthetic documents needs its own authorization and reviewed fixture cleanup.
- Monitor sanitized transaction failures, database-unavailable responses, retry/unknown outcomes, and latency after any separately approved release. Assign an incident owner and rollback operator before activation.
- Maintain existing backup/recovery expectations; verification is not a backup or recovery exercise.
- Preserve existing legacy metrics/ticket, Google Sheets, email, scheduler, and alert workflows.
- Keep all endpoints disabled until the separate activation gate is approved.

## 11. Outstanding decisions and dependencies

1. Which deployment environment is intended for the first future verification, and who owns it?
2. Which infrastructure/DBA owner can provide sanitized topology, version, and index metadata?
3. Which representative isolated non-production environment is approved for transaction execution?
4. Are the declared submission indexes already deployed in the intended production database, and is there an approved rollout procedure if they are not?
5. Who owns monitoring, incident escalation, and rollback?
6. What release owner can approve a separate, route-specific activation decision?

No provider, connection target, credential source, database name, or infrastructure topology is selected here.

## 12. Final readiness assessment

**Not ready for production activation.** The local Step 5C result is evidence for the guarded local test setup only. Production environment identity, MongoDB topology/version, index state, transaction capability, and operational readiness remain unverified. Gates 1–7 are all **Not assessed** in this plan.

This plan authorizes no infrastructure access, database operation, migration, source change, or endpoint activation. The three self-service GET operations, POST, and submission detail remain disabled.

### Safety and scope confirmation

This planning task involved static source/document inspection only. No database was accessed; no tests, commands against infrastructure, migrations, or external services were run. No `.env` file or secret was inspected. No source code, configuration, legacy workflow, database, or existing project artifact was modified. No commit or push was made.
