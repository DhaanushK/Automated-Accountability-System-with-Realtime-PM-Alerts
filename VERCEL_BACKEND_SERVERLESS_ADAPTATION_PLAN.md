# Vercel Backend Serverless Adaptation Plan

**Prepared:** 2026-11-14  
**Scope:** Planning only; no implementation or endpoint activation is authorized by this document.  
**Backend:** `D:\Automated Accountability System\finalyear-backend`

## 1. Executive summary

The backend can be adapted to a Vercel Node.js Function while preserving Express, Mongoose's default connection, authentication, authorization, and transaction semantics. It is **not suitable for deployment in its current composition**: importing `src/server.js` loads dotenv, initiates a database connection, starts the alert scheduler, mounts integration-heavy legacy routes, installs process handlers, and calls `app.listen()`.

The recommended shape separates an import-safe Express application from local startup. The local `node src/server.js` workflow remains the owner of dotenv loading, DB initialization, optional scheduler startup, listener creation, and shutdown. The Vercel path must not import the local bootstrap or initialize schedulers. Use a module-scoped promise to share one default Mongoose connection attempt among requests in a warm instance, await it before database-backed request handling, and retain the current session-based transactions without a sessionless fallback.

Two constraints need resolution before implementation:

1. Vercel documents automatic Express deployment when a recognized application file (including `src/app.js`) exports the Express app as its default export. In that mode the app is deployed as one Function and receives incoming routes. A separate `api/index.js` entry is not required. If the team chooses a standalone `api/index.js` Function instead, it must explicitly route every intended path (including nested `/api/*`) to that Function and prove the path behavior in preview. Do not create competing Express entrypoints.
2. The current server composes many unrelated Sheets, email, calendar, ticket, and alert routes. The public portfolio demo needs a separately declared, allowlisted route composition. The local composition must retain its existing routes; demo deployment must exclude outbound/record-mutating integrations unless separately reviewed.

**Recommendation:** Implement in small, separately reviewed workstreams, deploy first to preview with synthetic data, and keep all five Daily Submission operations at 501. Deployment compatibility is not production readiness. Vercel runtime limits and account eligibility must be rechecked at deployment. Current Vercel documentation describes Express as one Function and documents plan-dependent duration and bundle limits. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express), [Function limits](https://vercel.com/docs/functions/limitations).

## 2. Current backend startup architecture

### Verified source facts

- [`src/server.js`](<D:/Automated Accountability System/finalyear-backend/src/server.js>) currently creates the Express app and also owns dotenv loading, DB connection startup, scheduler startup, listener creation, shutdown, and error handling. It starts an async `connectDB()` as the module is imported, calls `initializeAlertScheduler()` after connect, invokes `app.listen()`, may call `process.exit()`, and does not export the app.
- It mounts both daily-submission routes and legacy routes for authentication, Google auth, metrics, logs, Sheets, PM/TL/TM email, general email, users, mailbox, calendar, tickets, and alerts.
- The production-style daily-submission composition injects the read service and readiness predicate but explicitly sets `enableSelfServiceReads: false`. The controller defaults that option to false. Its current submit, three self-service reads, and detail methods are 501 stubs.
- [`src/config/db.js`](<D:/Automated Accountability System/finalyear-backend/src/config/db.js>) calls `mongoose.connect(process.env.MONGO_URI)` on the default Mongoose connection. Current options include `maxPoolSize: 10`, `serverSelectionTimeoutMS: 30000`, `socketTimeoutMS: 45000`, `autoIndex: true`, retry reads/writes, and IPv4 selection. Its source comment mentions retries, but the function contains no explicit retry loop.
- [`src/services/readTransaction.js`](<D:/Automated Accountability System/finalyear-backend/src/services/readTransaction.js>) uses the default connection, starts a session, invokes `withTransaction()` with primary read preference and snapshot read concern, and ends the session in `finally`. It has no sessionless fallback.
- [`src/services/dailySubmissionReadiness.js`](<D:/Automated Accountability System/finalyear-backend/src/services/dailySubmissionReadiness.js>) synchronously checks connection state and identity/registration of User, ExpectedSubmission, and MetricSubmission models. It performs no DB operation and does not prove live transaction or index capability.
- [`src/routes/dailySubmissionRoutes.js`](<D:/Automated Accountability System/finalyear-backend/src/routes/dailySubmissionRoutes.js>) puts its readiness guard before authentication for the daily-submission router. The disabled controller behavior remains the boundary.
- [`src/schedulers/alertScheduler.js`](<D:/Automated Accountability System/finalyear-backend/src/schedulers/alertScheduler.js>) starts node-cron jobs only when `initializeAlertScheduler()` is called. The current server calls it after DB startup.
- [`package.json`](<D:/Automated Accountability System/finalyear-backend/package.json>) keeps `npm start` as `node src/server.js` and `npm run dev` as `nodemon src/server.js`. It has no Node `engines` declaration.

### Planning consequence

Split composition from process lifecycle; do not turn the existing startup file into a serverless handler. Treat each route set as an explicit composition choice rather than relying on accidental import exclusions.

## 3. Proposed application/bootstrap/function separation

### Proposed responsibilities

| Component | Responsibility |
|---|---|
| `src/app.js` | Import-safe Express factory/application. Configure request parsing, safe security/logging/error middleware, and one explicitly selected route composition. Export the Express app; do not load dotenv, connect eagerly, listen, exit, or start cron at module evaluation. |
| `src/server.js` | Local bootstrap. Load local environment configuration, validate local settings, await the default DB connection, select full local route composition, optionally initialize the existing scheduler according to explicit local policy, then listen. Own shutdown handlers. Keep `node src/server.js` working. |
| `api/index.js` (optional) | If using an explicit Function file rather than Vercel's Express detection, provide a thin request entry that ensures the cached default DB connection before delegating to the app. It must not create another app, connection, or scheduler. Configure and test catch-all path routing. |
| `vercel.json` | Declare only the selected Vercel project/routing/runtime configuration. Do not add a rewrite that accidentally sends all paths to an unintended function or bypasses API authentication. |
| Connection module (proposed, e.g. `src/config/serverlessDb.js`) | Cache in-flight connection establishment per warm process and use the existing default Mongoose connection. Fail safely; no per-request disconnect. |

### Entry strategy decision

**Preferred minimum:** Export `src/app.js` as the default Express application from a path Vercel officially recognizes, with one request-level database-readiness gate before DB-backed demo routes. Vercel documents that an Express app deployed this way becomes one Function and that every incoming request is handled by its Express router. This avoids a second adapter and the ambiguity of a single `api/index.js` path. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

**Alternative:** Keep `api/index.js` as the Function entry only if the deployment config demonstrably forwards all intended paths (e.g. nested `/api/auth/login`, not only the base path) to it. Validate actual request path preservation and route matching in a Vercel preview before release. Do not combine automatic Express discovery and a duplicate adapter until Vercel's build output confirms which entry is deployed.

### Local command compatibility

Keep `node src/server.js` as the local command. Refactor `server.js` to import the app and perform local-only setup. Local mode retains the full established route set and controlled scheduler behavior. Tests should import app factories/services without triggering DB connections, cron, listener startup, or process exit.

## 4. MongoDB connection lifecycle

### Proposed behavior

1. Import models before request handling so they remain registered on Mongoose's default connection, the same connection used by `runReadTransaction()`.
2. On request, call an idempotent `ensureDatabaseReady()` before any DB-backed route work. If the connection is already connected, resolve immediately. If a connect is in progress, await the same promise. If disconnected, create one new connection attempt and cache it.
3. Clear a rejected connection promise so a later invocation can retry, but impose bounded attempts/time. Do not retry indefinitely within a request or hide failure behind a default/fallback URI.
4. If connection state becomes stale/disconnected after a successful connect, fail closed for that request and permit one bounded re-establishment path on a later request. Do not let concurrent requests create multiple pools on the same warm instance.
5. Do not disconnect after each request: warm instances handle multiple requests and connection reuse is intentional. Reuse is per process/instance only; separate Vercel instances have independent module memory and pools.
6. Keep identity consistent: default Mongoose connection, models registered on it, and transaction runner using it. Preserve readiness checks; connection establishment must happen before they are relied on.
7. Require the deployment URI explicitly and fail startup/request readiness if absent. Do not use localhost fallback in deployed composition. Never log the URI or credentials.

### Pool and timeout decisions

The current pool max is 10 per Mongoose connection. With serverless scale-out, aggregate possible DB connections can grow roughly with the number of active instances times pool capacity. Do not assume one shared pool globally. Consider:

- A smaller per-instance pool: reduces aggregate sockets and Atlas pressure, but can queue requests within a busy warm instance.
- Keeping the current pool: lower local queuing, but may multiply into excessive sockets at scale.
- A serverless-aware pooler/driver option: could improve reuse, but adds infrastructure and must be separately evaluated.

Choose values only after identifying expected peak instances/concurrency, Atlas connection quota, region/network latency, and request profile. Set server-selection and socket/request timeouts so connection waits fit comfortably inside the Function's execution budget. Current 30-second server-selection timeout may consume much of a short request budget; decide whether to lower it based on measured connection behavior, not guesswork. Bound retries with jitter/backoff only if the retry budget fits request latency. Do not stack unbounded application, driver, and platform retries.

### Failure behavior

On missing URI, connection failure, or disconnection: return the existing safe unavailable response where applicable (daily submission readiness uses safe 503 semantics), do not run a sessionless read, and do not leak topology, credentials, or raw driver errors.

## 5. Transaction preservation

No transaction service change is part of this plan. Preserve:

- `runReadTransaction()` as the production read transaction runner.
- Primary read preference and snapshot read concern.
- One session propagated to actor, authorization, reporting, and count queries.
- Session cleanup in `finally`.
- Existing transaction error classification and safe API errors.
- No sessionless fallback or independent nontransactional reads.
- Write-service transaction boundaries, stable submission identity across retries, and existing policy/deadline/punctuality snapshots.

Serverless introduces these operational risks:

- Cold-start connection latency can consume request duration before transaction start.
- Function cancellation/timeout can interrupt an in-flight DB operation; timeouts must be bounded and surfaced safely.
- Per-instance concurrency and horizontal scaling multiply connection pools.
- Transaction capability is determined by MongoDB topology/configuration, not a connected Mongoose state.
- Retries may replay read callbacks; maintain existing idempotent/read-only behavior.
- Public demo must use synthetic/non-sensitive data and least-privilege DB credentials.

Any transaction code change would require a separate technical review and explicit scope approval. This workstream plans only the connection/bootstrap boundary.

## 6. Public-demo route isolation

### Two explicit compositions

- **Local full composition:** Retain every route mount currently present in `src/server.js` so existing local development behavior is not silently removed.
- **Portfolio demo composition:** Build an explicit allowlist of routes needed for the demo. Do not import or mount unrelated Sheets write routes, email-sending routes, PM alert execution, calendar integration, or endpoints that mutate legacy records. Prefer not importing excluded modules at all if their module evaluation loads credentials or external clients.

Do not treat “scheduler not started” as sufficient isolation: existing email/Sheets/calendar routes are independently mounted today. Do not delete local routes to make the demo safe; select separate composition at bootstrap/deployment.

Preserve authentication middleware, database-authoritative actor/role checks, authorization services, validation, and safe errors for all included routes.

Keep all five daily-submission operations unavailable:

- GET `/api/daily-submissions/me/current`: 501.
- GET `/api/daily-submissions/me/:reportingDate`: 501.
- GET `/api/daily-submissions/me/history`: 501.
- POST `/api/daily-submissions`: 501 after existing readiness/auth/validation prerequisites.
- GET `/api/daily-submissions/:submissionId`: 501.

The self-service-read toggle stays explicitly false. Never wire read/write services into controllers as part of deployment adaptation.

## 7. Security and logging remediation

### Current exposure to remediate

The current request logger prints request body, query, and params. This can expose passwords, employee metrics, identifiers, and tokens. The generic error handler logs raw errors and may return a stack in development. The compatibility audit also identified frontend Axios response-error logging that may include headers such as Authorization. These are source findings from the audit and should be rechecked in the implementation phase; this task did not inspect or modify those frontend files.

### Proposed logging policy

- Log a generated request/correlation ID, method, stable route template (not raw path identifiers), status, duration, and safe error category.
- Never log Authorization/Cookie headers, JWTs, passwords, request bodies, raw query strings, employee IDs, submitted metrics, MongoDB URI, or raw driver errors.
- For expected 4xx responses, log at a restrained level without user payload. For 5xx, log sanitized error class/code and correlation ID; keep stack traces in restricted, access-controlled diagnostics only if policy allows.
- Return stable safe error envelopes; map DB failures to existing codes/statuses. No stack, topology, host, or database names to API clients.
- Validate required secrets/URI at bootstrap without echoing values. Keep Google/email integrations out of public-demo imports so their configuration is not required for unrelated demo routes.
- Review CORS/CSP and allowed origins separately for the deployed frontend/backend topology; do not add wildcard credentials behavior.
- Keep secrets in platform environment configuration, not source, logs, build output, or frontend-prefixed variables.

## 8. Vercel Function constraints

**Platform-documented facts (recheck before deployment):**

- Vercel documents an Express deployment as a single Function with Fluid compute by default; Express handles incoming paths. `express.static()` does not serve assets on Vercel; use Vercel static hosting/public assets instead. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).
- The current Function limits page lists a 250 MB compressed bundle limit and up to 250 MB uncompressed (including runtime/layers), with plan/runtime-dependent limits. Check exact build artifact size; this repository includes large integration dependencies and an actual bundle measurement is outstanding. [Function limits](https://vercel.com/docs/functions/limitations).
- Function duration differs by plan and Fluid Compute configuration. The current docs list Hobby up to 300 seconds with Fluid Compute and 60 seconds without it; timeout returns a platform 504. Do not budget DB connection/retry work to the full maximum. Recheck account/project settings before deployment. [Duration configuration](https://vercel.com/docs/functions/configuring-functions/duration).
- Vercel's supported Node list currently includes Node 24.x, 22.x, and 20.x, with 24.x as the default for new projects; this repository does not pin a Node engine. Pin a tested major version only after compatibility checks. [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
- Express applications may receive concurrent requests in one warm instance under Fluid Compute. Avoid mutable request-global state and protect connection cache initialization. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

**Application-specific assumptions / unknowns:** Actual Hobby project setting, Function region, Node version selected for the project, deployed bundle size, cold-start latency, concurrency profile, monthly use, and observed DB latency are unknown. A plan feature is not an entitlement guarantee; verify account eligibility and commercial-use terms separately.

## 9. Scheduler and alert deferral

- Do not import `alertScheduler.js` from the Vercel app composition; do not call `initializeAlertScheduler()` in a Function module or request handler.
- Keep the current scheduler available only from the explicit local bootstrap or a future separately approved worker.
- Initial portfolio demo sends no PM email and does not invoke alert workflows.
- Do not substitute Vercel Cron for node-cron in this task. A future scheduler design must cover durable execution, idempotency keys, overlap prevention, missed-run catch-up, bounded retries/dead-letter handling, timezone/DST behavior, authorization of trigger endpoints, monitoring, and ownership of failures. Vercel Cron frequency/precision and plan eligibility need separate current review before any decision.
- Avoid background work that continues after the HTTP response unless the platform's supported lifecycle and durability guarantees are explicitly designed.

## 10. Local development compatibility

- Preserve `node src/server.js` and `npm run dev` (nodemon) as the local workflow.
- Keep local dotenv loading and full route composition in the bootstrap, not `app.js`/Function module imports.
- Keep local DB readiness awaited before listening; Vercel uses its request/Function initialization path, but both call the same default-connection manager.
- Keep scheduler behavior explicit: local startup may initialize it according to existing policy; tests and Vercel imports must not.
- Preserve local CORS behavior as a deliberate local configuration; define deployment origins separately.
- Existing tests should import app/service factories and inject dependencies rather than importing `server.js`. Add a regression proving importing app composition does not listen, connect, start scheduler, or exit.
- Package script changes are proposals only: retain `start` unless adapting bootstrap path is necessary; add no deploy-specific script until the Vercel project root and entry strategy are selected. No package file is changed by this plan.

## 11. Implementation workstreams

Each workstream is independent and must have its own review and approval before implementation. Tests listed here are proposed offline tests; no tests were run for this plan.

| # / workstream | Expected files | Behavior and preserved behavior | Proposed tests | Main risk | Acceptance / separate approval |
|---|---|---|---|---|---|
| 1. Extract import-safe Express app | `src/app.js` (new), `src/server.js` | Move middleware/error handling and route composition into app factory; local bootstrap retains dotenv, connection, scheduler, listener, shutdown, and full local routes. Preserve API paths, auth, error envelopes, local command. | App import has no listener/DB/scheduler side effects; route composition snapshots; existing named API and service unit tests. | Import-time integration side effects survive through transitive imports; accidental route drift. | Local startup contract and route inventory pass; explicit approval for app/bootstrap extraction. |
| 2. Vercel Function entry/routing | Preferred: recognized `src/app.js` default export plus `vercel.json`; optional `api/index.js` only under deliberate catch-all design | One Function receives intended paths; await DB readiness; errors end as safe responses. Avoid duplicate Express adapters. | Vercel preview tests for root, nested auth, nested API, 404, body parsing, headers, auth, 501 routes; verify request path and no function collision. | Base `api/index.js` may not receive nested paths without routing configuration; accidental frontend/API route collision. | Build output has one intended Express Function; route matrix passes; approval of the chosen Vercel entry strategy. |
| 3. Cached Mongoose connection management | `src/config/db.js` and/or new `src/config/serverlessDb.js`; readiness tests | Cache in-flight/default connection per warm process, bounded failure clearing/retry, awaited before DB routes; preserve model/default-connection identity and avoid per-request disconnect. | Concurrent calls share one connect; rejection clears cache; disconnected recovery; missing URI fails closed; model identity matches transaction runner. | Pool multiplication, cold-start delay, stale promise/state, risky timeout changes. | Behavior measured against target DB limits/latency; no fallback; infrastructure owner approves pool/timeouts. |
| 4. Isolate public-demo composition | `src/app.js`, new route-composition module if needed | Explicit demo allowlist excludes Sheets writes, email sends, calendar, alerts and unrelated mutations; local full route set unchanged. Daily submission 5 operations remain 501. | Route inventory allowlist/denylist; excluded modules not imported; prohibited handlers unreachable; all five disabled tests. | Hidden side effects through transitive imports; accidental exposure of mutation endpoints. | Threat-reviewed route manifest; synthetic-only demo; explicit approval of public route set. |
| 5. Logging and environment hardening | `src/app.js`, logger/error middleware, `src/config/env.js` only if needed; frontend logging is separate scope | Remove request payload/raw query/header logging; safe structured events; validate required configuration without values; no local Mongo fallback in deployment. | Secret/token/body redaction tests; safe DB error response tests; missing URI fails closed; no environment values in captured logs. | Observability loses necessary diagnostic context; mandatory unrelated config remains imported. | Security review confirms redaction and required env isolation; approve any env/config semantic change. |
| 6. Deployment routing/configuration | `vercel.json`, possibly Vercel project settings (outside repo) | Choose monorepo root and one routing strategy; preserve `/api/*` paths and avoid exposing static/local-only files. | Preview route smoke suite covering nested paths/methods/CORS/preflight and SPA/API separation; inspect generated function list. | Rewrites change paths, send frontend paths to backend, or create function overlap. | Preview routing report approved by developer/release owner; no production release approval implied. |
| 7. Local development compatibility | `src/server.js`; `package.json` only if authorized and needed | Preserve `node src/server.js`, nodemon, full local route set, local DB bootstrap and controlled cron. | Existing explicitly named local tests; local startup smoke under fake/injected DB where possible; check app imports remain side-effect free. | Developers lose current command or local integrations silently disappear. | Documented local workflow works; owners approve any script change. |
| 8. Offline regression verification | Explicit test files under `test/` only | Test app import, route composition, cache, error and security invariants without DB/network integrations. | Named only; no broad discovery. Verify existing auth/read transaction and daily API suites that are relevant. | Global state/order coupling; tests accidentally import legacy startup. | Every named suite passes; reviewers approve scope; separate approval required for integration tests. |
| 9. Isolated MongoDB integration verification | Existing guarded support and explicitly named integration test(s), only after separate approval | Verify intended test topology, transaction behavior, connection/session identity, and cleanup boundaries using synthetic owned fixtures. | Exact named integration command(s), never broad `node --test`. | Wrong target, data cleanup, topology differences, unavailable transaction support. | Test target separately approved; guarded identity checks pass; report evidence; explicit approval before any integration test execution. |

## 12. Acceptance criteria and approval gates

No workstream is implicitly approved by this plan. Before each implementation:

1. Approve the workstream and its exact file scope.
2. Confirm the current working tree and protect unrelated modifications.
3. Confirm no production DB, credentials, or external services are needed.
4. Add only the proposed tests for that stage and execute explicitly named offline suites.
5. Review diff and confirm local routes, authentication, transactions, and five 501 operations remain intact.
6. For routing, verify a Vercel preview with synthetic data before considering any production deployment.
7. For database integration, obtain separate explicit approval for the isolated target and named test command.
8. Keep final endpoint activation as a later, separate decision; this plan grants no activation approval.

## 13. Outstanding technical decisions

- Which Vercel entry strategy: Express autodetection from `src/app.js` (preferred) or a deliberately routed `api/index.js` adapter?
- What is the Vercel project root and whether frontend and backend are separate projects or a future multi-service deployment?
- Which exact paths form the public portfolio demo allowlist? Which legacy routes, if any, are safe to expose?
- Does the demo use synthetic data only, and how are public demo accounts provisioned and rotated?
- What approved Atlas target, region, topology, networking restrictions, per-instance connection quota, and credential role will be used?
- What concurrency, latency, cold-start, and bundle-size targets are acceptable?
- What Node major version is tested with this repository's dependencies?
- Should the scheduler run locally by default, behind an explicit local setting, or only in a future worker?
- How are logs retained, access-controlled, correlated, and monitored without payloads?
- Which CORS/CSP origins and same-origin API rewrite strategy will pair with the separately hosted frontend?
- Does the intended Vercel plan/account permit the actual use case? Confirm current plan and usage limits; do not infer from a local account or source.
- How will deployment/preview secrets be separated from production credentials and constrained to synthetic data?

## 14. Final recommendation

Proceed with planning-stage implementation **one workstream at a time**, starting with import-safe app extraction and local bootstrap compatibility. Choose the Express entry strategy before creating deployment configuration; the smallest route-safe design is the recognized default-exported `src/app.js` and one Express Function, with the optional `api/index.js` omitted unless explicit catch-all routing is required and verified. Next isolate the public-demo route composition, then implement and measure the default-connection cache, then address logging/configuration, and finally validate preview routing and deployment constraints.

Do not deploy the current `src/server.js` directly. Do not activate any Daily Submission endpoint. Infrastructure readiness, a preview deployment, production deployment, and endpoint activation are separate approvals. No fixed pool size, timeout, route allowlist, Atlas deployment, Vercel plan, or runtime version is selected here.

### Source and platform references

- Backend compatibility audit: [`VERCEL_DEPLOYMENT_COMPATIBILITY_AUDIT.md`](<D:/Automated Accountability System/VERCEL_DEPLOYMENT_COMPATIBILITY_AUDIT.md>)
- Vercel Express integration and single-Function behavior: [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- Current Vercel Node Function size, duration, memory, and concurrency limits: [Function limits](https://vercel.com/docs/functions/limitations)
- Function duration behavior and plan settings: [Duration configuration](https://vercel.com/docs/functions/configuring-functions/duration)
- Supported Node.js versions and `engines.node` configuration: [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- Routing and path rewrite semantics: [Vercel rewrites](https://vercel.com/docs/routing/rewrites)
- Request logs and route-level observations: [Vercel runtime logs](https://vercel.com/docs/logs/runtime)

### Verification boundary

This plan records source-level architecture facts and current platform documentation. It does not establish the deployed Vercel account settings, production database topology, transaction capability, index state, or operational readiness. No tests, application startup, DB connections, schedulers, email, Sheets, or external operations were performed.
