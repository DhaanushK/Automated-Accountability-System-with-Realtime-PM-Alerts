
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  createShutdownHandler,
  registerShutdownSignals
} from "../src/lifecycle/shutdownHandler.js";

function createFakeTimer() {
  let callback;
  let delay;
  let clearedHandle = null;

  const handle = { id: "fake-timer" };

  return {
    setTimer(fn, timeoutMs) {
      callback = fn;
      delay = timeoutMs;
      return handle;
    },

    clearTimer(receivedHandle) {
      clearedHandle = receivedHandle;
    },

    fire() {
      callback();
    },

    get delay() {
      return delay;
    },

    get clearedHandle() {
      return clearedHandle;
    },

    handle
  };
}

test("successful shutdown exits with status zero", async () => {
  const timer = createFakeTimer();
  const exits = [];

  const handler = createShutdownHandler({
    shutdown: async () => ({ success: true }),
    exit: code => exits.push(code),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer
  });

  await handler();

  assert.deepEqual(exits, [0]);
  assert.equal(timer.delay, 10000);
  assert.equal(timer.clearedHandle, timer.handle);
});

test("failed cleanup exits with status one", async () => {
  const timer = createFakeTimer();
  const exits = [];

  const handler = createShutdownHandler({
    shutdown: async () => ({
      success: false,
      errors: [{ stage: "database", error: new Error("Failure") }]
    }),
    exit: code => exits.push(code),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer
  });

  await handler();

  assert.deepEqual(exits, [1]);
  assert.equal(timer.clearedHandle, timer.handle);
});

test("unexpected shutdown errors are reported", async () => {
  const timer = createFakeTimer();
  const exits = [];
  const reportedErrors = [];
  const shutdownError = new Error("Unexpected failure");

  const handler = createShutdownHandler({
    shutdown: async () => {
      throw shutdownError;
    },
    exit: code => exits.push(code),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
    onError: error => reportedErrors.push(error)
  });

  await handler();

  assert.deepEqual(exits, [1]);
  assert.deepEqual(reportedErrors, [shutdownError]);
});

test("repeated shutdown calls share one execution", async () => {
  const timer = createFakeTimer();
  const exits = [];
  let shutdownCalls = 0;
  let resolveShutdown;

  const handler = createShutdownHandler({
    shutdown: () => {
      shutdownCalls += 1;

      return new Promise(resolve => {
        resolveShutdown = resolve;
      });
    },
    exit: code => exits.push(code),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer
  });

  const first = handler();
  const second = handler();

  assert.equal(first, second);
  assert.equal(shutdownCalls, 1);

  resolveShutdown({ success: true });

  await first;

  assert.deepEqual(exits, [0]);
});

test("force-exit timeout exits once with status one", async () => {
  const timer = createFakeTimer();
  const exits = [];
  const timeoutEvents = [];
  let resolveShutdown;

  const handler = createShutdownHandler({
    shutdown: () => new Promise(resolve => {
      resolveShutdown = resolve;
    }),
    exit: code => exits.push(code),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
    onTimeout: () => timeoutEvents.push("timeout")
  });

  const execution = handler();

  timer.fire();

  assert.deepEqual(exits, [1]);
  assert.deepEqual(timeoutEvents, ["timeout"]);

  resolveShutdown({ success: true });
  await execution;

  assert.deepEqual(exits, [1]);
});

test("shutdown start callback runs only once", async () => {
  const timer = createFakeTimer();
  const starts = [];

  const handler = createShutdownHandler({
    shutdown: async () => ({ success: true }),
    exit: () => {},
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
    onStart: () => starts.push("started")
  });

  await handler();
  await handler();

  assert.deepEqual(starts, ["started"]);
});

test("registers SIGINT and SIGTERM handlers", async () => {
  const emitter = new EventEmitter();
  const timer = createFakeTimer();
  const signals = [];
  const exits = [];

  const handler = createShutdownHandler({
    shutdown: async () => ({ success: true }),
    exit: code => exits.push(code),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
    onStart: () => signals.push("shutdown")
  });

  const unregister = registerShutdownSignals(handler, emitter);

  assert.equal(emitter.listenerCount("SIGINT"), 1);
  assert.equal(emitter.listenerCount("SIGTERM"), 1);

  emitter.emit("SIGINT");
  emitter.emit("SIGTERM");
  await handler();

  assert.deepEqual(signals, ["shutdown"]);
  assert.deepEqual(exits, [0]);

  unregister();

  assert.equal(emitter.listenerCount("SIGINT"), 0);
  assert.equal(emitter.listenerCount("SIGTERM"), 0);
});

test("repeated SIGINT and SIGTERM signals during shutdown share one execution", async () => {
  const emitter = new EventEmitter();
  const timer = createFakeTimer();

  const exits = [];
  const starts = [];

  let shutdownCalls = 0;
  let resolveShutdown;

  const handler = createShutdownHandler({
    shutdown: () => {
      shutdownCalls += 1;

      return new Promise(resolve => {
        resolveShutdown = resolve;
      });
    },

    exit: code => exits.push(code),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
    onStart: () => starts.push("started")
  });

  const unregister = registerShutdownSignals(handler, emitter);

  emitter.emit("SIGINT");

  const firstShutdown = handler();

  emitter.emit("SIGTERM");
  emitter.emit("SIGINT");

  const secondShutdown = handler();

  assert.equal(shutdownCalls, 1);
  assert.equal(starts.length, 1);
  assert.equal(firstShutdown, secondShutdown);
  assert.deepEqual(exits, []);

  resolveShutdown({ success: true });

  await firstShutdown;

  assert.deepEqual(exits, [0]);
  assert.equal(timer.clearedHandle, timer.handle);

  unregister();

  assert.equal(emitter.listenerCount("SIGINT"), 0);
  assert.equal(emitter.listenerCount("SIGTERM"), 0);
});
