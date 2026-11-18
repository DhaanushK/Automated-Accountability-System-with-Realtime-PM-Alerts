
import test from "node:test";
import assert from "node:assert/strict";

import User from "../src/models/User.js";
import ExpectedSubmission from "../src/models/ExpectedSubmission.js";
import MetricSubmission from "../src/models/MetricSubmission.js";

import {
  withIntegrationDatabase
} from "./support/mongoIntegration.js";

import {
  createDailySubmissionInfrastructureVerifier
} from "../src/services/dailySubmissionInfrastructureVerification.js";

const MODELS = {
  User,
  ExpectedSubmission,
  MetricSubmission
};

async function readIndexInventory(models) {
  return Promise.all(
    Object.entries(models).map(async ([modelName, Model]) => [
      modelName,
      await Model.collection.listIndexes().toArray()
    ])
  );
}

test(
  "approved integration replica set passes daily-submission infrastructure verification",
  async () => {
    await withIntegrationDatabase(async connection => {
      // Capture the existing indexes before verification.
      const indexesBefore = await readIndexInventory(MODELS);

      const verify =
        createDailySubmissionInfrastructureVerifier({
          connection,
          models: MODELS
        });

      const result = await verify();

      // Verify overall infrastructure readiness.
      assert.equal(
        result.ready,
        true,
        JSON.stringify(result, null, 2)
      );

      assert.equal(result.checks.connection.verified, true);
      assert.equal(result.checks.models.verified, true);

      // Verify transaction-compatible topology.
      assert.equal(result.topology.type, "replicaSet");
      assert.equal(
        result.topology.setName,
        "accountabilityTestRS"
      );
      assert.equal(
        result.checks.transactionTopology.verified,
        true
      );

      // Verify declared indexes.
      assert.equal(result.checks.indexes.verified, true);
      assert.deepEqual(result.errors, []);

      // Core scope: User (1) + ExpectedSubmission (3)
      // + MetricSubmission (3) = 7 declared indexes.
      const verifiedIndexCount = Object.values(
        result.checks.indexes.models
      ).reduce((total, model) => {
        return (
          total +
          model.indexes.filter(index => index.verified).length
        );
      }, 0);

      assert.equal(verifiedIndexCount, 7);

      // Confirm verification did not alter any indexes.
      const indexesAfter = await readIndexInventory(MODELS);

      assert.deepEqual(
        indexesAfter,
        indexesBefore,
        "Infrastructure verification must not modify database indexes"
      );
    });
  }
);
