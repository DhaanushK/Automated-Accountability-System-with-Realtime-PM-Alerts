# Phase 3B.4.1 — Unexpected Collection Investigation Report

**Investigation date:** 2026-11-11  
**Scope:** Read-only source tracing and guarded collection/index metadata inspection. No document query was performed.

## Exact verified database identity

Connected only with `setupIntegrationDatabase()` from `finalyear-backend/test/support/mongoIntegration.js`; that helper validated the URI before connecting and verified MongoDB `hello` afterward.

| Field | Verified value |
|---|---|
| Host | `127.0.0.1` |
| Port | `27018` |
| Database | `accountability_app_integration_test` |
| Replica set | `accountabilityTestRS` |
| Writable primary | `true` |
| Member / primary | `127.0.0.1:27018` |
| Members | Exactly `127.0.0.1:27018` |

## Collection metadata observed

Read using `listCollections()` filtered to the exact collection name, then `listIndexes()` for that collection only. No documents were read.

| Metadata field | Observed value |
|---|---|
| Name | `submission_corrections` |
| Type | `collection` |
| Options | `{}` |
| UUID | `584aa8c1-0a9e-45b3-a430-54678eaf308b` |
| Index metadata | Only `_id_` on `{ _id: 1 }` |

The collection name exactly matches the `collection: "submission_corrections"` schema option in `finalyear-backend/src/models/SubmissionCorrection.js:65`. The model declares three secondary indexes at lines 93–103, but none were present in the observed collection metadata. This is consistent with the Phase 3B.4 helper setting `autoIndex: false` and its explicit index-creation loop excluding `SubmissionCorrection`.

## Model registration and import chain

- `finalyear-backend/src/models/SubmissionCorrection.js:1-2` imports Mongoose and the date validator; it has no direct connection call.
- `SubmissionCorrection.js:13-66` defines the correction schema and explicitly names the collection. `:68-90` defines validation middleware; only the Approved branch queries the User model. `:93-103` declares three secondary schema indexes. `:106` registers the model with `mongoose.model("SubmissionCorrection", submissionCorrectionSchema)`, which uses the default Mongoose connection/model registry.
- `finalyear-backend/test/daily-submission-integration.test.js:9` statically imports `SubmissionCorrection` before the test connects. Its MODELS list used for index verification at line 36 includes User, SubmissionPolicy, ExpectedSubmission, and MetricSubmission, but excludes SubmissionCorrection. The correction check at approximately line 313 calls `SubmissionCorrection.hydrate(...)` and mutates the resulting document in memory. It does not call `create`, `save`, or a database query, and it does not run the approval validation hook.
- `finalyear-backend/test/submission-foundation.test.js:11` also imports the model, but that is an offline test file; importing it alone does not connect to MongoDB. It was not part of the Phase 3B.4 integration process.
- `finalyear-backend/test/support/fixtures.js` imports only User, SubmissionPolicy, and ExpectedSubmission. It does not import or create a correction.
- `finalyear-backend/test/provisionIntegrationDatabase.js` imports the guarded connection helper only and explicitly creates `integration_provisioning`; it does not import SubmissionCorrection or name `submission_corrections`.
- The integration test's explicit `createIndex()` loop iterates only the four models in its MODELS list. It could not explicitly create this collection or its indexes.

## Mongoose initialization and implicit creation mechanism

The installed Mongoose runtime inspected for this investigation is 8.23.0. Its source provides a concrete implicit collection-creation path:

1. `node_modules/mongoose/lib/mongoose.js:68-75` sets the global default `autoCreate` option to `true`.
2. `node_modules/mongoose/lib/model.js:1117-1142` builds each model's `$init` promise. Its `_createCollection()` checks schema/connection options; if the connection is not yet open, it waits for connection, rechecks options, and calls `Model.createCollection()` when `autoCreate` is true.
3. `node_modules/mongoose/lib/connection.js:1353` resolves connection `autoCreate` from the connection option when specified, otherwise from the Mongoose base default.
4. `setupIntegrationDatabase()` passes `autoIndex: false` but does not pass `autoCreate: false`. Disabling automatic secondary-index creation therefore does not disable automatic collection creation.

Because the integration test compiled `SubmissionCorrection` before opening the guarded connection, model initialization could wait until that connection opened and then create the explicitly named collection. The observed collection has empty options and only the standard `_id_` index, which is consistent with this automatic collection-creation path and with no explicit correction index build.

## Confirmed cause versus likely cause

### Confirmed by source/runtime evidence

- Mongoose 8.23.0 has `autoCreate: true` by default.
- Model initialization calls `createCollection()` automatically when `autoCreate` resolves true.
- The guarded test connection disables `autoIndex` but does not disable `autoCreate`.
- The integration test imports `SubmissionCorrection` before connecting.
- The correction schema maps to the observed collection name.
- The live collection exists and has no correction secondary indexes.
- The integration test's explicit index loop and fixture helpers do not include SubmissionCorrection.

### Most likely explanation

The most likely cause is Mongoose's automatic collection initialization for the statically imported `SubmissionCorrection` model when the test connection became available. `SubmissionCorrection.hydrate()` itself is an in-memory operation; the collection was likely created by model initialization rather than by hydration.

### Conclusiveness

The historical creation event cannot be established conclusively from read-only collection metadata. The metadata has no creation timestamp or creator field, and no database command/audit log was examined. The auto-create mechanism and import timing make it a strong explanation, but the exact command that created this collection remains unproven.

## Connection teardown

The guarded helper completed its post-connect host/port/database/replica/primary verification. The metadata query completed, and `teardownIntegrationDatabase()` was awaited in `finally`. The final Mongoose connection state was disconnected (`readyState: 0`).

## Safety confirmation

- Only metadata for the authorized `submission_corrections` collection was read; no document query or document content was accessed.
- No insert, update, delete, cleanup, collection creation, collection drop, or index creation/drop was performed during this investigation.
- No operation was made against `accountability_transaction_test`, port `27017`, or any application/production database.
- No `.env` value, application startup, test, scheduler, alert, email, or Google Sheets integration was used.
- No code or configuration files were modified. Only this report was created.
