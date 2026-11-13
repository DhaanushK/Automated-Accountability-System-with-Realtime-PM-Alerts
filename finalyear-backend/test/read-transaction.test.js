
import test from "node:test";
import assert from "node:assert/strict";

import {
  createReadTransactionRunner
} from "../src/services/readTransaction.js";

// --------------------------------------------------
// TEST 1: DISCONNECTED DATABASE
// --------------------------------------------------

test("Rejects when MongoDB connection is not ready", async () => {
  let sessionCreated = false;

  const connection = {
    readyState: 0,

    async startSession() {
      sessionCreated = true;
      throw new Error("Session should not be created");
    }
  };

  const runReadTransaction =
    createReadTransactionRunner(connection);

  await assert.rejects(
    runReadTransaction(async () => "result"),
    /DATABASE_UNAVAILABLE/
  );

  assert.equal(sessionCreated, false);
});


// --------------------------------------------------
// TEST 2: SNAPSHOT TRANSACTION
// --------------------------------------------------

test("Runs operation using primary snapshot transaction", async () => {
  const fakeSession = {};
  let receivedSession = null;
  let receivedOptions = null;
  let sessionEnded = false;

  const connection = {
    readyState: 1,

    async startSession() {
      fakeSession.withTransaction = async (callback, options) => {
        receivedOptions = options;
        await callback();
      };
      fakeSession.endSession = async () => {
        sessionEnded = true;
      };
      return fakeSession;
    }
  };

  const runReadTransaction =
    createReadTransactionRunner(connection);

  const result = await runReadTransaction(async session => {
    receivedSession = session;
    return "READ_SUCCESS";
  });

  assert.equal(result, "READ_SUCCESS");
  assert.equal(receivedSession, fakeSession);
  assert.deepEqual(receivedOptions, {
    readPreference: "primary",
    readConcern: {
      level: "snapshot"
    }
  });
  assert.equal(sessionEnded, true);
});


// --------------------------------------------------
// TEST 3: SESSION CLEANUP ON FAILURE
// --------------------------------------------------

test("Ends session when read operation fails", async () => {
  let sessionEnded = false;

  const connection = {
    readyState: 1,

    async startSession() {
      return {
        async withTransaction(callback) {
          await callback();
        },

        async endSession() {
          sessionEnded = true;
        }
      };
    }
  };

  const runReadTransaction =
    createReadTransactionRunner(connection);

  await assert.rejects(
    runReadTransaction(async () => {
      throw new Error("SIMULATED_READ_FAILURE");
    }),
    /SIMULATED_READ_FAILURE/
  );

  assert.equal(sessionEnded, true);
});


// --------------------------------------------------
// TEST 4: TRANSACTION CALLBACK RETRY
// --------------------------------------------------

test("Returns result from the final transaction callback attempt", async () => {
  let attempts = 0;
  let sessionEnded = false;

  const connection = {
    readyState: 1,

    async startSession() {
      return {
        async withTransaction(callback) {
          await callback();
          await callback();
        },

        async endSession() {
          sessionEnded = true;
        }
      };
    }
  };

  const runReadTransaction =
    createReadTransactionRunner(connection);

  const result = await runReadTransaction(async () => {
    attempts += 1;
    return `ATTEMPT_${attempts}`;
  });

  assert.equal(attempts, 2);
  assert.equal(result, "ATTEMPT_2");
  assert.equal(sessionEnded, true);
});


// --------------------------------------------------
// TEST 5: INVALID OPERATION
// --------------------------------------------------

test("Rejects a non-function transaction operation", async () => {
  const connection = {
    readyState: 1
  };

  const runReadTransaction =
    createReadTransactionRunner(connection);

  await assert.rejects(
    runReadTransaction(null),
    /Read transaction operation must be a function/
  );
});
