# Vercel Deployment Compatibility Audit

**Audit date:** 2026-11-14  
**Scope:** Read-only source and official platform-documentation review. No tests, application startup, database access, environment-file reads, or external integrations.

## 1. Executive summary

**Verdict: Compatible after architectural adaptation; not deploy-ready as composed.** Vercel supports Express Node.js Functions and Vite static sites. The repository's separate backend/frontend directories fit two Vercel projects rooted in a monorepo. The main blocker is `finalyear-backend/src/server.js`: it constructs Express but also loads dotenv, connects to MongoDB immediately, starts the alert scheduler, calls `app.listen()`, may call `process.exit()`, and exports no app.

Mongoose's default-connection transaction design can remain with an awaited, cached connection per warm function instance. Vite's proxy is development-only, so production API routing, SPA fallback, CSP and CORS need configuration. Vercel Hobby is personal/non-commercial only. Its Cron timing is at most once daily per job with ±59-minute precision, unsuitable for dependable current alert timing. [Hobby](https://vercel.com/docs/plans/hobby), [Fair Use](https://vercel.com/docs/limits/fair-use-guidelines), [Cron](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)

## 2. Existing backend architecture

### Verified source facts

- Backend scripts are `node src/server.js` and `nodemon src/server.js`. Manifest declares Express 4/Mongoose 8; no Node `engines` value.
- `src/server.js` configures Express, middleware, routes and error handling, then starts its listener during module import. It also loads dotenv, starts `connectDB()`, starts `initializeAlertScheduler()` after DB connection, and may call `process.exit(1)`. It exports no app.
- Request logger outputs body, query and params; this risks logging login passwords/submitted data. Replace it with redacted logging before public deployment.
- Server mounts legacy Sheets, ticket, calendar, email and alert routes. Deferring cron does not disable all PM email routes.
- Imported modules may load dotenv or require Google/JWT config at module evaluation. This audit inspected source only, not env files/values.
- `src/config/db.js` uses `process.env.MONGO_URI`, `maxPoolSize: 10`, 30-second server selection timeout and `autoIndex: true`. No explicit application retry loop is present despite a comment.
- Vercel documents Express Functions, a 250 MB Function bundle limit, and app export/listener entry patterns. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)

## 3. Backend compatibility analysis

**Express:** Compatible after extracting an import-safe, default-exported app from local startup. Keep dotenv, DB/listener/shutdown in a separate local bootstrap. Preserve async error forwarding and safe responses. Remove request-body logging and never log credentials, JWTs, auth headers or raw DB errors.

**Routes/readiness:** Self-service GET reads are composed with `enableSelfServiceReads: false`; GETs, POST and detail remain 501. Keep them disabled. Readiness is synchronous: serverless bootstrap must await connection before readiness runs and fail closed if the connection drops.

**Configuration imports:** Runtime env values can be supplied by Vercel, but unused Google/email settings may currently be required during module import. Isolate optional integration config for demo composition. `config/env.js` defines a localhost Mongo fallback whereas `config/db.js` uses `process.env.MONGO_URI`; deployment must fail closed on a missing approved URI.

**Bundle/runtime:** Dependencies include Google, Excel/PDF, mail and spreadsheet packages. Bundle size is unmeasured. Verify against Vercel's 250 MB limit; pin a Node runtime in a future change.

## 4. MongoDB and connection analysis

`readTransaction.js` uses the default Mongoose connection, creates a session, runs primary/snapshot `withTransaction()`, and ends the session in `finally`; there is no sessionless fallback. Models are registered on that connection. Readiness checks connection state and User, ExpectedSubmission, MetricSubmission registration, not live transaction or index state.

For serverless, cache one in-flight/successful connect promise per warm instance, share it across simultaneous cold-start requests, clear failed/stale state, and don't disconnect per request. Instances don't share memory; correctness must not rely on globals. `maxPoolSize:10` is per connection, so scale-out multiplies possible sockets. Tune pool and 30-second server selection timeout to Atlas/function limits. Await connection before readiness and retain the default connection/model identity/session guarantees. Do not rely on `autoIndex:true` as index evidence.

MongoDB supports transactions on replica sets and sharded clusters. Atlas Free currently specifies a three-node replica topology and no sharding, so topology appears compatible by inference; actual transaction capability still requires a test. Atlas Free has limited connections/storage/throughput, no private endpoints/network peering or failover testing, and may pause idle clusters. Do not broadly open DB network access as a workaround. [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/), [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/), [Mongoose 8 connections](https://mongoosejs.com/docs/8.x/docs/connections.html)

Production Atlas identity/topology/indexes remain unknown; no database connection occurred.

## 5. Scheduler and alert architecture

- `server.js` starts `initializeAlertScheduler()` after DB connection.
- `alertScheduler.js` registers 9:00 AM and 5:00 PM daily plus Monday 10:00 AM, Asia/Kolkata.
- Process-local node-cron is not durable with scale-to-zero; multiple instances can duplicate or miss jobs.
- Vercel Cron invokes HTTP functions, but Hobby is once daily/job with ±59-minute precision. That cannot preserve dependable existing timings. Later scheduling needs an authenticated, idempotent endpoint/worker, catch-up/retry and monitoring.
- Keep scheduled work and PM email sending disabled in the initial public demo; separately exclude or gate existing email routes. [Vercel Cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)

## 6. Frontend compatibility

- Vite React SPA with React Router `BrowserRouter`; `npm run build`.
- `vite.config.js` proxies `/api` to localhost:5002 only in development.
- Axios uses relative API paths with no production base URL.
- CSP allows localhost origins, not deployed backend host; CORS allows localhost only.
- Active Login and ProtectedRoute use localStorage key `token`; separate auth helper stores `user_token`. Verify whether it is used.
- Existing frontend `vercel.json` is empty; no SPA fallback.

Configure Vercel root `finalyear-frontend`, build `npm run build`, output `dist`, SPA rewrite. Choose same-origin `/api/*` rewrite or public non-secret `VITE_API_BASE_URL`; coordinate CORS/CSP for cross-origin. Never put secrets in `VITE_*`. [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Monorepos](https://vercel.com/docs/monorepos), [Rewrites](https://vercel.com/docs/routing/rewrites)

## 7. Compatibility matrix

| Component | Current implementation | Classification | Required change | Risk |
|---|---|---|---|---|
| Express app | Not exported; in startup module | Compatible with minor changes | Extract/default-export pure app | High |
| HTTP startup | DB, scheduler, listener/exit on import | Requires architectural adaptation | Separate local bootstrap | Critical |
| Mongoose | Default connection, pool 10 | Compatible with adaptation | Per-instance connect cache; await before readiness; size pool | High |
| Transactions | Primary/snapshot session, no fallback | Compatible if target supports it | Verify approved Atlas target | Medium/unverified |
| Auth | JWT + persisted User; browser bearer | Compatible with minor changes | Secrets, origins, logging review | High |
| Daily-submission routes | Self-service reads disabled | Compatible; intentionally unavailable | Preserve 501 stubs | Informational |
| Readiness | Sync model/connection check | Compatible after bootstrap | Connect before readiness; fail closed | High |
| Scheduler | node-cron at startup | Requires architectural adaptation | Exclude from function; later protected worker | High |
| PM alerts | Routes mounted, cron sends mail | Requires demo adaptation | Keep sends off; isolate routes | High |
| React/Vite | Static SPA | Compatible with minor changes | Build and SPA fallback | Low |
| API/CSP/CORS | Dev proxy/local origins | Compatible with minor changes | Rewrite or base URL; production origins | High |
| Hobby eligibility | Not in source | Cannot determine | Verify personal/non-commercial use | High/policy |
| Atlas Free | No target configured | Cannot determine | Verify networking/quotas/transactions | High/infra |

## 8. Recommended target structure

```text
Automated Accountability System/
├── finalyear-frontend/       # Vercel project 1: Vite static SPA
└── finalyear-backend/        # Vercel project 2: Express Function
    └── src/
        ├── app.js             # pure Express app, default export
        └── server.js          # local DB/scheduler/listener bootstrap
```

Configure two monorepo projects with separate root directories. Function imports only app composition; no dotenv, connect-at-import, listen, process exit or node-cron. Await cached DB connection before readiness; retain default connection and transaction safeguards. Local bootstrap remains separate. Initial demo composition excludes unused Sheets/email/alert side effects. Frontend builds to `dist`, has SPA fallback and same-origin/API-origin routing. [Express](https://vercel.com/docs/frameworks/backend/express), [Monorepos](https://vercel.com/docs/monorepos)

## 9. Risks and unresolved questions

1. Hosting account/region, backend-to-Atlas path, database identity/version/topology unknown.
2. Is this personal/non-commercial? Hobby terms restrict use accordingly; business use needs another plan or policy confirmation. [Fair Use](https://vercel.com/docs/limits/fair-use-guidelines)
3. Use synthetic demo data only; review public exposure of existing email/Sheets/ticket routes.
4. Atlas Free networking/connection/resource limits need acceptance; don't use broad access.
5. Pool sizing across serverless instances is unknown.
6. Request logger prints body; Axios response error logger includes headers and may leak Authorization.
7. Verify auth helper callers; Vercel build size/cold-start/transaction success unverified.
8. Node runtime pin, deployed CSP/CORS and monitoring are undefined.
9. All five daily-submission operations remain disabled; this does not authorize activation.

## 10. Minimum implementation changes required

No implementation was made. Future work:

1. Extract pure Express app/default export; local bootstrap owns dotenv, DB connect, scheduler, listener and shutdown; update local start script.
2. Cache bounded Mongoose connection per warm instance; clear stale state, await before readiness, preserve default connection and sessions; tune pool/timeout.
3. Demo route composition excludes scheduler and external email/Sheets side effects unless separately approved.
4. Remove sensitive server/browser logging; require explicit intended server URI/secrets; remove localhost DB fallback for deployed paths.
5. Configure frontend Vercel root/build/dist/SPA fallback/API route and production CSP/CORS.
6. Pin supported Node, check function bundle and plan eligibility.
7. Later perform authorized offline and isolated non-production verification. Keep GET/POST/detail disabled.

## 11. Final recommendation

**Prepare deployment only; do not deploy the current backend entry point unchanged.** Vercel supports Express and Vite, but startup separation, connection reuse, route isolation, frontend security/routing, and Hobby eligibility must be resolved first.

Transactions can remain if the selected Atlas target passes approved isolated verification. Atlas Free may suit a low-traffic synthetic portfolio demo, not proven production readiness. Hobby may fit personal non-commercial use; its Cron precision does not preserve current alert timings. Recheck limits at deployment.

### Official sources reviewed

- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Hobby plan](https://vercel.com/docs/plans/hobby)
- [Fair Use](https://vercel.com/docs/limits/fair-use-guidelines)
- [Cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)
- [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
- [Mongoose 8 connections](https://mongoosejs.com/docs/8.x/docs/connections.html)

### Safety confirmation

Read-only audit. No source/config/package or existing artifact changed; no tests/app startup ran. No database, scheduler, email, Sheets or other external service was accessed. No env file or secret was read; `submission_corrections` was not inspected. No endpoint activation, commit or push.
