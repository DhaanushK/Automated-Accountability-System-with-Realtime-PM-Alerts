
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
  createConnectionManager
} from "../src/config/db.js";

import {
  createShutdownHandler
} from "../src/lifecycle/shutdownHandler.js";

// Create a deferred promise that we can resolve manually.
function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

// Create a fake Mongoose instance.
function createFakeMongoose() {
  const connection = new EventEmitter();

  connection.readyState = 0;

  let closeCalls = 0;

  connection.close = async () => {
    closeCalls += 1;
    connection.readyState = 0;
    return connection;
  };

  const mongooseInstance = {
    connection,

    connect: async () => {
      throw new Error("Unexpected connection attempt");
    }
  };

  return {
    mongooseInstance,
    connection,
    getCloseCalls: () => closeCalls
  };
}

// TEST 1: CONNECTION RESOLVES BEFORE SHUTDOWN TIMEOUT

test(
  "Completes graceful shutdown when pending MongoDB connection resolves",
  async () => {
    const deferred = createDeferred();
    const fake = createFakeMongoose();

    const connectDB = createConnectionManager({
      mongooseInstance: fake.mongooseInstance,
      getMongoUri: () => "mongodb://test.invalid/database"
    });

    // Simulate an externally initiated pending connection.
    fake.connection.readyState = 2;
    fake.connection.asPromise = () => deferred.promise;

    const connectionRequest = connectDB();

    const exitCodes = [];
    let timeoutCallback;
    let timeoutCleared = false;

    const shutdown = createShutdownHandler({
      shutdown: async () => {
        await connectDB.disconnect();

        return { success: true };
      },

      exit: code => exitCodes.push(code),

      setTimer: callback => {
        timeoutCallback = callback;
        return "fake-timer";
      },

      clearTimer: timer => {
        assert.equal(timer, "fake-timer");
        timeoutCleared = true;
      },

      timeoutMs: 10000
    });

    const shutdownRequest = shutdown();

    // Shutdown must wait for the pending connection.
    assert.equal(fake.getCloseCalls(), 0);
    assert.deepEqual(exitCodes, []);

    // Resolve the connection before the timeout fires.
    fake.connection.readyState = 1;
    deferred.resolve(fake.connection);

    await connectionRequest;
    await shutdownRequest;

    assert.equal(fake.getCloseCalls(), 1);
    assert.equal(fake.connection.readyState, 0);
    assert.deepEqual(exitCodes, [0]);
    assert.equal(timeoutCleared, true);

    // The timeout must not have fired.
    assert.equal(typeof timeoutCallback, "function");
  }
);

// TEST 2: CONNECTION REMAINS PENDING BEYOND SHUTDOWN TIMEOUT

test(
  "Requests forced exit when MongoDB connection remains pending beyond timeout",
  async () => {
    const deferred = createDeferred();
    const fake = createFakeMongoose();

    const connectDB = createConnectionManager({
      mongooseInstance: fake.mongooseInstance,
      getMongoUri: () => "mongodb://test.invalid/database"
    });

    // Simulate an externally initiated pending connection.
    fake.connection.readyState = 2;
    fake.connection.asPromise = () => deferred.promise;

    const connectionRequest = connectDB();

    const exitCodes = [];
    let timeoutCallback;
    let timeoutCalls = 0;

    const shutdown = createShutdownHandler({
      shutdown: async () => {
        await connectDB.disconnect();

        return { success: true };
      },

      exit: code => exitCodes.push(code),

      setTimer: callback => {
        timeoutCallback = callback;
        return "fake-timer";
      },

      clearTimer: () => {},

      timeoutMs: 10000,

      onTimeout: () => {
        timeoutCalls += 1;
      }
    });

    const shutdownRequest = shutdown();

    // The connection is still pending.
    assert.equal(fake.getCloseCalls(), 0);
    assert.deepEqual(exitCodes, []);

    // Simulate the 10-second deadline expiring.
    timeoutCallback();

    assert.deepEqual(exitCodes, [1]);
    assert.equal(timeoutCalls, 1);

    // Now allow the pending connection to resolve so
    // the test can finish without leaving work pending.
    fake.connection.readyState = 1;
    deferred.resolve(fake.connection);

    await connectionRequest;
    await shutdownRequest;

    // Cleanup eventually completes, but must not request
    // a second process exit.
    assert.equal(fake.getCloseCalls(), 1);
    assert.equal(fake.connection.readyState, 0);
    assert.deepEqual(exitCodes, [1]);
    assert.equal(timeoutCalls, 1);
  }
);
