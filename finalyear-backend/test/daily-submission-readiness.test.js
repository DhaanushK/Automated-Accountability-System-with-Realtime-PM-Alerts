import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../src/models/User.js";
import ExpectedSubmission from "../src/models/ExpectedSubmission.js";
import MetricSubmission from "../src/models/MetricSubmission.js";
import { isDailySubmissionReadReady } from "../src/services/dailySubmissionReadiness.js";

const MODEL_NAMES = ["User", "ExpectedSubmission", "MetricSubmission"];

function fixture(readyState = 1) {
  const connection = { readyState, models: {} };
  const models = {};

  for (const modelName of MODEL_NAMES) {
    const model = function FakeMongooseModel() {};
    model.modelName = modelName;
    model.db = connection;
    models[modelName] = model;
    connection.models[modelName] = model;
  }

  return { connection, models };
}

test("connected connection with all exact registered model objects is ready", () => {
  const { connection, models } = fixture();

  assert.equal(
    isDailySubmissionReadReady({ connection, models }),
    true
  );
});

test("disconnected connection is not ready", () => {
  const { connection, models } = fixture(0);

  assert.equal(
    isDailySubmissionReadReady({ connection, models }),
    false
  );
});

test("each required model missing independently fails closed", () => {
  for (const missingName of MODEL_NAMES) {
    const { connection, models } = fixture();
    delete connection.models[missingName];

    assert.equal(
      isDailySubmissionReadReady({ connection, models }),
      false,
      missingName
    );
  }
});

test("different object registered under the same model name fails closed", () => {
  const { connection, models } = fixture();
  const replacement = function ReplacementModel() {};
  replacement.modelName = "ExpectedSubmission";
  replacement.db = connection;
  connection.models.ExpectedSubmission = replacement;

  assert.equal(
    isDailySubmissionReadReady({ connection, models }),
    false
  );
});

test("model registered on another connection fails closed", () => {
  const { connection, models } = fixture();
  const otherConnection = { readyState: 1, models: {} };
  const foreignModel = function ForeignModel() {};
  foreignModel.modelName = "MetricSubmission";
  foreignModel.db = otherConnection;
  models.MetricSubmission = foreignModel;
  connection.models.MetricSubmission = foreignModel;

  assert.equal(
    isDailySubmissionReadReady({ connection, models }),
    false
  );
});

test("model database reference mismatch fails closed", () => {
  const { connection, models } = fixture();
  models.User.db = { readyState: 1, models: {} };

  assert.equal(
    isDailySubmissionReadReady({ connection, models }),
    false
  );
});

test("missing or malformed model metadata fails closed", () => {
  const { connection, models } = fixture();
  models.ExpectedSubmission.modelName = undefined;

  assert.equal(
    isDailySubmissionReadReady({ connection, models }),
    false
  );
  assert.equal(
    isDailySubmissionReadReady({ connection, models: null }),
    false
  );
  assert.equal(
    isDailySubmissionReadReady({ connection: { readyState: 1 }, models }),
    false
  );
});

test("production models are the exact objects registered on the default connection", () => {
  assert.equal(mongoose.connection.models.User, User);
  assert.equal(mongoose.connection.models.ExpectedSubmission, ExpectedSubmission);
  assert.equal(mongoose.connection.models.MetricSubmission, MetricSubmission);
});

test("readiness evaluation performs no connection, registration, query, or state mutation", () => {
  const { connection, models } = fixture();
  let sideEffects = 0;
  connection.connect = () => { sideEffects += 1; };
  connection.model = () => { sideEffects += 1; };
  connection.collection = () => { sideEffects += 1; };
  connection.startSession = () => { sideEffects += 1; };
  const beforeReadyState = connection.readyState;
  const beforeRegistry = { ...connection.models };

  assert.equal(
    isDailySubmissionReadReady({ connection, models }),
    true
  );
  assert.equal(sideEffects, 0);
  assert.equal(connection.readyState, beforeReadyState);
  assert.deepEqual(connection.models, beforeRegistry);
});