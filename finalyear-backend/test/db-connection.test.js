
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
  createConnectionManager
} from "../src/config/db.js";


function createFakeMongoose({
  readyState = 0,
  connect,
  close
} = {}) {
  const connection = new EventEmitter();

  connection.readyState = readyState;
  connection.asPromise = async () => connection;

  let connectCalls = 0;
  let closeCalls = 0;

  connection.close = async (...args) => {
    closeCalls += 1;

    if (close) {
      return close(...args);
    }

    connection.readyState = 0;
    return connection;
  };

  const mongooseInstance = {
    connection,

    connect: async (...args) => {
      connectCalls += 1;

      if (connect) {
        return connect(...args);
      }

      connection.readyState = 1;
      return mongooseInstance;
    }
  };

  return {
    mongooseInstance,
    connection,
    getConnectCalls: () => connectCalls,
    getCloseCalls: () => closeCalls
  };
}


// TEST 1: REUSE EXISTING CONNECTION

test("Reuses an already connected default Mongoose connection", async () => {
  const fake = createFakeMongoose({ readyState: 1 });

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  const result = await connectDB();

  assert.equal(result, fake.connection);
  assert.equal(fake.getConnectCalls(), 0);
});

// TEST 2: SHARE CONCURRENT CONNECTION ATTEMPTS

test("Shares one connection attempt between concurrent callers", async () => {
  let resolveConnection;

  const connectionPromise = new Promise(resolve => {
    resolveConnection = resolve;
  });

  const fake = createFakeMongoose({
    connect: () => connectionPromise
  });

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  const firstRequest = connectDB();
  const secondRequest = connectDB();

  assert.equal(fake.getConnectCalls(), 1);

  fake.connection.readyState = 1;
  resolveConnection(fake.mongooseInstance);

  const [firstResult, secondResult] = await Promise.all([
    firstRequest,
    secondRequest
  ]);

  assert.equal(firstResult, fake.connection);
  assert.equal(secondResult, fake.connection);
  assert.equal(fake.getConnectCalls(), 1);
});

// TEST 3: MISSING MONGO URI

test("Rejects missing MONGO_URI without attempting a connection", async () => {
  const fake = createFakeMongoose();

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => undefined
  });

  await assert.rejects(
    connectDB(),
    /MONGO_URI is not configured/
  );

  assert.equal(fake.getConnectCalls(), 0);
});

// TEST 4: FAILED CONNECTION RECOVERY

test("Clears failed connection promise and allows a subsequent retry", async () => {
  let attempts = 0;

  const fake = createFakeMongoose({
    connect: async () => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error("SIMULATED_CONNECTION_FAILURE");
      }

      fake.connection.readyState = 1;
      return fake.mongooseInstance;
    }
  });

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  await assert.rejects(
    connectDB(),
    /SIMULATED_CONNECTION_FAILURE/
  );

  const result = await connectDB();

  assert.equal(result, fake.connection);
  assert.equal(attempts, 2);
});

// TEST 5: EXISTING CONNECTION ATTEMPT

test("Waits for an already-connecting Mongoose connection", async () => {
  let resolveConnection;

  const existingConnectionPromise = new Promise(resolve => {
    resolveConnection = resolve;
  });

  const fake = createFakeMongoose({
    readyState: 2
  });

  fake.connection.asPromise = () => existingConnectionPromise;

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  const pendingRequest = connectDB();

  assert.equal(fake.getConnectCalls(), 0);

  fake.connection.readyState = 1;
  resolveConnection();

  const result = await pendingRequest;

  assert.equal(result, fake.connection);
  assert.equal(fake.getConnectCalls(), 0);
});

// TEST 6: DISCONNECTING CONNECTION

test("Rejects while the Mongoose connection is disconnecting", async () => {
  const fake = createFakeMongoose({
    readyState: 3
  });

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  await assert.rejects(
    connectDB(),
    /currently disconnecting/
  );

  assert.equal(fake.getConnectCalls(), 0);
});

// TEST 7: EVENT LISTENER REGISTRATION

test("Registers connection event listeners only once per Mongoose connection", () => {
  const fake = createFakeMongoose();

  const firstManager = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  const secondManager = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  assert.equal(typeof firstManager, "function");
  assert.equal(typeof secondManager, "function");

  assert.equal(fake.connection.listenerCount("connected"), 1);
  assert.equal(fake.connection.listenerCount("disconnected"), 1);
  assert.equal(fake.connection.listenerCount("reconnected"), 1);
  assert.equal(fake.connection.listenerCount("error"), 1);
});

// TEST 8: SHARE AN EXTERNALLY INITIATED CONNECTION ATTEMPT

test("Shares an existing connection attempt between concurrent callers", async () => {
  let resolveConnection;
  let asPromiseCalls = 0;

  const existingConnectionPromise = new Promise(resolve => {
    resolveConnection = resolve;
  });

  const fake = createFakeMongoose({
    readyState: 2
  });

  fake.connection.asPromise = () => {
    asPromiseCalls += 1;
    return existingConnectionPromise;
  };

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  const firstRequest = connectDB();
  const secondRequest = connectDB();

  assert.equal(asPromiseCalls, 1);
  assert.equal(fake.getConnectCalls(), 0);

  fake.connection.readyState = 1;
  resolveConnection();

  const [firstResult, secondResult] = await Promise.all([
    firstRequest,
    secondRequest
  ]);

  assert.equal(firstResult, fake.connection);
  assert.equal(secondResult, fake.connection);
  assert.equal(asPromiseCalls, 1);
});

// TEST 9: RECOVER FROM FAILED EXISTING CONNECTION ATTEMPT

test("Clears a failed existing connection promise and permits retry", async () => {
  let attempts = 0;

  const fake = createFakeMongoose({
    readyState: 2
  });

  fake.connection.asPromise = async () => {
    attempts += 1;

    if (attempts === 1) {
      throw new Error("SIMULATED_EXISTING_CONNECTION_FAILURE");
    }

    fake.connection.readyState = 1;
    return fake.connection;
  };

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  await assert.rejects(
    connectDB(),
    /SIMULATED_EXISTING_CONNECTION_FAILURE/
  );

  fake.connection.readyState = 2;

  const result = await connectDB();

  assert.equal(result, fake.connection);
  assert.equal(attempts, 2);
  assert.equal(fake.getConnectCalls(), 0);
});

test("Reuses an established connection without requiring MONGO_URI", async () => {
  const fake = createFakeMongoose({
    readyState: 1
  });

  let uriReads = 0;

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => {
      uriReads += 1;
      return undefined;
    }
  });

  const result = await connectDB();

  assert.equal(result, fake.connection);
  assert.equal(uriReads, 0);
  assert.equal(fake.getConnectCalls(), 0);
});

test("Forwards configured connection options to Mongoose", async () => {
  const fake = createFakeMongoose();
  let receivedUri;
  let receivedOptions;

  const customOptions = {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 5,
    autoIndex: false
  };

  fake.mongooseInstance.connect = async (uri, options) => {
    receivedUri = uri;
    receivedOptions = options;
    fake.connection.readyState = 1;
    return fake.mongooseInstance;
  };

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database",
    connectionOptions: customOptions
  });

  await connectDB();

  assert.equal(receivedUri, "mongodb://test.invalid/database");
  assert.strictEqual(receivedOptions, customOptions);
  assert.equal(receivedOptions.serverSelectionTimeoutMS, 15000);
  assert.equal(receivedOptions.maxPoolSize, 5);
  assert.equal(receivedOptions.autoIndex, false);
});

test("Closes an established MongoDB connection", async () => {
  const fake = createFakeMongoose({ readyState: 1 });

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  await connectDB.disconnect();

  assert.equal(fake.getCloseCalls(), 1);
  assert.equal(fake.connection.readyState, 0);
});

test("Waits for an in-flight connection before disconnecting", async () => {
  let resolveConnection;

  const pendingConnection = new Promise(resolve => {
    resolveConnection = resolve;
  });

  const fake = createFakeMongoose({
    connect: () => pendingConnection
  });

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  const connectionRequest = connectDB();
  const disconnectRequest = connectDB.disconnect();

  assert.equal(fake.getCloseCalls(), 0);

  fake.connection.readyState = 1;
  resolveConnection(fake.mongooseInstance);

  const [, disconnectResult] = await Promise.all([
    connectionRequest,
    disconnectRequest
  ]);

  assert.equal(fake.getCloseCalls(), 1);
  assert.equal(fake.connection.readyState, 0);
});

test("Completes disconnect after an in-flight connection fails", async () => {
  let rejectConnection;

  const pendingConnection = new Promise((resolve, reject) => {
    rejectConnection = reject;
  });

  const fake = createFakeMongoose({
    connect: () => pendingConnection
  });

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  const connectionRequest = connectDB();

  const disconnectRequest = connectDB.disconnect();

  rejectConnection(new Error("SIMULATED_CONNECTION_FAILURE"));

  await assert.rejects(
    connectionRequest,
    /SIMULATED_CONNECTION_FAILURE/
  );

  await disconnectRequest;

  assert.equal(fake.getCloseCalls(), 0);
});

test("Shares one disconnect operation between concurrent callers", async () => {
  let resolveClose;

  const pendingClose = new Promise(resolve => {
    resolveClose = resolve;
  });

  const fake = createFakeMongoose({
    readyState: 1,
    close: () => pendingClose
  });

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  const firstRequest = connectDB.disconnect();
  const secondRequest = connectDB.disconnect();

  assert.equal(fake.getCloseCalls(), 1);

  fake.connection.readyState = 0;
  resolveClose();

  await Promise.all([firstRequest, secondRequest]);

  assert.equal(fake.getCloseCalls(), 1);
});

test("Waits for an externally initiated connection before disconnecting", async () => {
  let resolveConnection;

  const pendingConnection = new Promise(resolve => {
    resolveConnection = resolve;
  });

  const fake = createFakeMongoose({
    readyState: 2
  });

  fake.connection.asPromise = () => pendingConnection;

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  const connectionRequest = connectDB();
  const disconnectRequest = connectDB.disconnect();

  assert.equal(fake.getConnectCalls(), 0);
  assert.equal(fake.getCloseCalls(), 0);

  fake.connection.readyState = 1;
  resolveConnection();

  await Promise.all([connectionRequest, disconnectRequest]);

  assert.equal(fake.getCloseCalls(), 1);
  assert.equal(fake.connection.readyState, 0);
});

test("Prevents new connections while disconnecting", async () => {
  let resolveClose;

  const pendingClose = new Promise(resolve => {
    resolveClose = resolve;
  });

  const fake = createFakeMongoose({
    readyState: 1,
    close: () => pendingClose
  });

  const connectDB = createConnectionManager({
    mongooseInstance: fake.mongooseInstance,
    getMongoUri: () => "mongodb://test.invalid/database"
  });

  const disconnectRequest = connectDB.disconnect();

  await assert.rejects(
    connectDB(),
    /disconnecting/
  );

  assert.equal(fake.getConnectCalls(), 0);

  fake.connection.readyState = 0;
  resolveClose();

  await disconnectRequest;
});
