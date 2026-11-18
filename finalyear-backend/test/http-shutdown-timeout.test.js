
import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import { test } from "node:test";

import {
  createShutdownHandler
} from "../src/lifecycle/shutdownHandler.js";

test("shutdown timeout exits once when an HTTP request remains active", async t => {
  let releaseResponse;
  let resolveShutdown;
  let timeoutCallback;
  let clearedTimer = false;

  const exits = [];
  const timeoutEvents = [];

  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/plain"
    });

    response.write("request-started");

    new Promise(resolve => {
      releaseResponse = resolve;
    }).then(() => {
      response.end("request-finished");
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);

    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  let closePromise;

  t.after(async () => {
    releaseResponse?.();

    if (closePromise) {
      await closePromise.catch(() => {});
    } else if (server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  const address = server.address();

  const response = await new Promise((resolve, reject) => {
    const request = get(
      `http://127.0.0.1:${address.port}`,
      resolve
    );

    request.on("error", reject);
  });

  response.resume();

  closePromise = new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error);
      else resolve();
    });
  });

  const handler = createShutdownHandler({
    shutdown: () => closePromise.then(() => ({
      success: true
    })),

    exit: code => exits.push(code),

    setTimer: callback => {
      timeoutCallback = callback;
      return { id: "timeout-test" };
    },

    clearTimer: () => {
      clearedTimer = true;
    },

    timeoutMs: 10000,

    onTimeout: () => timeoutEvents.push("timeout")
  });

  const shutdownExecution = handler();

  // Simulate the configured 10-second timeout.
  timeoutCallback();

  assert.deepEqual(exits, [1]);
  assert.deepEqual(timeoutEvents, ["timeout"]);
  assert.equal(clearedTimer, false);

  // Allow the active HTTP request to finish after timeout.
  releaseResponse();

  await closePromise;
  await shutdownExecution;

  assert.deepEqual(exits, [1]);
  assert.deepEqual(timeoutEvents, ["timeout"]);
  assert.equal(clearedTimer, true);
});
