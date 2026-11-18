import mongoose from "mongoose";

import User from "../models/User.js";
import ExpectedSubmission from "../models/ExpectedSubmission.js";
import MetricSubmission from "../models/MetricSubmission.js";

const REQUIRED_MODEL_NAMES = ["User", "ExpectedSubmission", "MetricSubmission"];
const PRODUCTION_MODELS = Object.freeze({
  User,
  ExpectedSubmission,
  MetricSubmission
});

/**
 * Check application-side prerequisites for daily-submission reads.
 * This is synchronous and performs no database operations.
 * Transaction and index readiness require separate deployment verification.
 */
export function isDailySubmissionReadReady({
  connection = mongoose.connection,
  models = PRODUCTION_MODELS
} = {}) {
  try {
    if (
      !connection ||
      connection.readyState !== 1 ||
      !connection.models ||
      typeof connection.models !== "object" ||
      !models ||
      typeof models !== "object"
    ) {
      return false;
    }

    for (const modelName of REQUIRED_MODEL_NAMES) {
      const expectedModel = models[modelName];
      if (
        typeof expectedModel !== "function" ||
        expectedModel.modelName !== modelName ||
        connection.models[modelName] !== expectedModel ||
        expectedModel.db !== connection
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}