
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import SubmissionAccessGrant from
  "../src/models/SubmissionAccessGrant.js";

const validGrant = () => ({
  userId: new mongoose.Types.ObjectId(),
  scope: "ORGANIZATION",
  active: true,
  grantedBy: null,
  grantReason: "Synthetic authorization for integration testing.",
  grantSource: "SIMULATED_AUTHORIZATION",
  provisioningRunId: "PM_GRANT_TEST_001"
});

test("SubmissionAccessGrant accepts a valid simulated grant", async () => {
  const grant = new SubmissionAccessGrant(validGrant());

  await assert.doesNotReject(() => grant.validate());

  assert.equal(grant.active, true);
  assert.equal(grant.revokedAt, null);
  assert.equal(grant.revokedBy, null);
});

test("SubmissionAccessGrant requires user, scope and reason", async () => {
  const grant = new SubmissionAccessGrant({
    grantSource: "SIMULATED_AUTHORIZATION",
    provisioningRunId: "PM_GRANT_TEST_001"
  });

  await assert.rejects(() => grant.validate());
});

test("SubmissionAccessGrant rejects unsupported scopes", async () => {
  const grant = new SubmissionAccessGrant({
    ...validGrant(),
    scope: "TEAM"
  });

  await assert.rejects(() => grant.validate());
});

test("SubmissionAccessGrant rejects unsupported grant sources", async () => {
  const grant = new SubmissionAccessGrant({
    ...validGrant(),
    grantSource: "UNKNOWN"
  });

  await assert.rejects(() => grant.validate());
});

test("Active grant rejects revocation metadata", async () => {
  const grant = new SubmissionAccessGrant({
    ...validGrant(),
    revokedAt: new Date(),
    revocationReason: "Unexpected revocation"
  });

  await assert.rejects(() => grant.validate());
});

test("Revoked grant requires timestamp and reason", async () => {
  const grant = new SubmissionAccessGrant({
    ...validGrant(),
    active: false
  });

  await assert.rejects(() => grant.validate());
});

test("Revoked grant accepts valid revocation metadata", async () => {
  const grant = new SubmissionAccessGrant({
    ...validGrant(),
    active: false,
    revokedBy: null,
    revokedAt: new Date(),
    revocationReason: "Synthetic revocation test."
  });

  await assert.doesNotReject(() => grant.validate());
});

test("SubmissionAccessGrant declares active-grant uniqueness", () => {
  const indexes = SubmissionAccessGrant.schema.indexes();

  const uniqueIndex = indexes.find(
    ([key, options]) =>
      options.name === "uniq_active_user_access_scope"
  );

  assert.ok(uniqueIndex);
  assert.deepEqual(
    uniqueIndex[0],
    { userId: 1, scope: 1 }
  );
  assert.equal(uniqueIndex[1].unique, true);
  assert.deepEqual(
    uniqueIndex[1].partialFilterExpression,
    { active: true }
  );
});

test("SubmissionAccessGrant declares history index", () => {
  const indexes = SubmissionAccessGrant.schema.indexes();

  const historyIndex = indexes.find(
    ([, options]) =>
      options.name === "user_access_grant_history"
  );

  assert.ok(historyIndex);
});

test("SubmissionAccessGrant rejects unexpected fields", () => {
  assert.throws(
    () =>
      new SubmissionAccessGrant({
        userId: new mongoose.Types.ObjectId(),
        scope: "ORGANIZATION",
        grantReason: "Synthetic test authorization",
        grantSource: "SIMULATED_AUTHORIZATION",
        provisioningRunId: "test-run-001",
        organizationId: "UNEXPECTED",
      }),
    {
      name: "StrictModeError",
      path: "organizationId",
    }
  );
});

test("SubmissionAccessGrant disables automatic collection and index creation", () => {
  assert.equal(
    SubmissionAccessGrant.schema.options.autoCreate,
    false
  );

  assert.equal(
    SubmissionAccessGrant.schema.options.autoIndex,
    false
  );
});
