# Phase 3B.4.2 — Guarded Infrastructure Hardening Report

**Date:** 2026-11-11  
**Status:** COMPLETED — Offline regression verification passed.

## 1. Objective

Harden the isolated MongoDB integration-test connection infrastructure to prevent unintended automatic collection and index creation during future integration tests.

The change addresses the collection-creation deviation identified in:

`PHASE_3B_4_1_COLLECTION_DEVIATION_INVESTIGATION_REPORT.md`

The investigation identified Mongoose's default `autoCreate: true` behaviour as the most likely explanation for the unexpected `submission_corrections` collection.

## 2. Configuration Changes

File modified:

`finalyear-backend/test/support/mongoIntegration.js`

The guarded connection configuration now explicitly includes:

```javascript
await client.connect(target, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  autoIndex: false,
  autoCreate: false,
  retryWrites: true
});
```

### Configuration behaviour

| Option | Configuration | Purpose |
|---|---|---|
| `autoIndex` | `false` | Prevents automatic Mongoose index creation. |
| `autoCreate` | `false` | Prevents automatic Mongoose collection creation. |
| `retryWrites` | `true` | Retains retryable-write configuration. |

Collection and index creation must remain explicit and limited to approved test operations.

## 3. Regression Test Changes

File modified:

`finalyear-backend/test/guarded-mongo-support.test.js`

The offline mock connection was updated to capture the options passed to its `connect()` method.

A new regression test was added:

`guarded connection disables automatic collection and index creation`

The test verifies:

```javascript
assert.equal(metrics.receivedOptions.autoCreate, false);
assert.equal(metrics.receivedOptions.autoIndex, false);
```

This confirms that both safety settings are explicitly passed to the guarded connection function.

## 4. Test Execution Results

Only the explicitly named offline regression test was executed:

```powershell
node --test test/guarded-mongo-support.test.js
```

**Final result:**

| Metric | Result |
|---|---:|
| Total tests | 17 |
| Passed | 17 |
| Failed | 0 |
| Skipped | 0 |
| Cancelled | 0 |

All 17 offline tests passed.

Existing checks for target validation, replica-set verification, cleanup allowlisting, fixture protection, verified identity, and connection teardown continued to pass.

## 5. Scope and Safety

- Only the guarded MongoDB test infrastructure and its offline regression test were modified.
- No application models, routes, controllers, services, middleware, or production configuration were changed.
- No `.env` files were accessed or modified.
- No live MongoDB connection was made during this offline regression run.
- No database collections or documents were created, modified, inspected, or deleted.
- The existing `submission_corrections` collection remains untouched.
- No production database or external integration was accessed.
- No broad test discovery was executed.
- The Phase 3B.1 submission POST handler remains `501 NOT_IMPLEMENTED`.

## 6. Verification Limitations

The new regression test verifies the connection options passed by the guarded infrastructure using a mocked client.

It does not independently prove that no collection can be created through every possible Mongoose model-initialization path in a live MongoDB environment.

A future live verification may be performed within the authorized isolated test database, using only explicitly approved operations.

## 7. Final Assessment

**Phase 3B.4.2: COMPLETED — Offline regression verification passed.**

The guarded integration-test connection now explicitly disables both automatic collection creation and automatic index creation.

The existing database target restrictions, verification safeguards, fixture protections, cleanup allowlist, and teardown behaviour remain covered by the offline regression suite.

The application submission write service is still not implemented. Phase 3B.4 remains BLOCKED until the actual application write service is implemented and its integration scenarios are successfully tested.

**Recommended next phase:** Phase 3B.5 — Submission Write-Service Implementation.