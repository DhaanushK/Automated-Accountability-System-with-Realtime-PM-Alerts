
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createShutdownCoordinator
} from "../src/lifecycle/shutdownCoordinator.js";

test("executes shutdown operations in dependency order", async () => {
  const events = [];

  const shutdown = createShutdownCoordinator({
    stopScheduler: async () => events.push("scheduler"),
    closeHttpServer: async () => events.push("http"),
    closeDatabase: async () => events.push("database")
  });

  const result = await shutdown();

  assert.deepEqual(events, [
    "scheduler",
    "http",
    "database"
  ]);

  assert.equal(result.success, true);
  assert.deepEqual(result.errors, []);
});

test("continues cleanup when scheduler shutdown fails", async () => {
  const events = [];
  const schedulerError = new Error("Scheduler failure");

  const shutdown = createShutdownCoordinator({
    stopScheduler: async () => {
      events.push("scheduler");
      throw schedulerError;
    },
    closeHttpServer: async () => events.push("http"),
    closeDatabase: async () => events.push("database")
  });

  const result = await shutdown();

  assert.deepEqual(events, ["scheduler", "http", "database"]);
  assert.equal(result.success, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].stage, "scheduler");
  assert.equal(result.errors[0].error, schedulerError);
});

test("continues database cleanup when HTTP shutdown fails", async () => {
  const events = [];
  const httpError = new Error("HTTP shutdown failure");

  const shutdown = createShutdownCoordinator({
    stopScheduler: async () => events.push("scheduler"),
    closeHttpServer: async () => {
      events.push("http");
      throw httpError;
    },
    closeDatabase: async () => events.push("database")
  });

  const result = await shutdown();

  assert.deepEqual(events, ["scheduler", "http", "database"]);
  assert.equal(result.success, false);
  assert.equal(result.errors[0].stage, "http-server");
  assert.equal(result.errors[0].error, httpError);
});

test("reports database shutdown failure", async () => {
  const databaseError = new Error("Database shutdown failure");

  const shutdown = createShutdownCoordinator({
    stopScheduler: async () => {},
    closeHttpServer: async () => {},
    closeDatabase: async () => {
      throw databaseError;
    }
  });

  const result = await shutdown();

  assert.equal(result.success, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].stage, "database");
  assert.equal(result.errors[0].error, databaseError);
});

test("concurrent shutdown calls share one execution", async () => {
  const events = [];

  const shutdown = createShutdownCoordinator({
    stopScheduler: async () => events.push("scheduler"),
    closeHttpServer: async () => events.push("http"),
    closeDatabase: async () => events.push("database")
  });

  const firstShutdown = shutdown();
  const secondShutdown = shutdown();

  assert.equal(firstShutdown, secondShutdown);

  await Promise.all([firstShutdown, secondShutdown]);

  assert.deepEqual(events, ["scheduler", "http", "database"]);
});

test("waits for scheduler shutdown before closing HTTP and database", async () => {
  const events = [];
  let resolveScheduler;

  const shutdown = createShutdownCoordinator({
    stopScheduler: () => {
      events.push("scheduler");

      return new Promise(resolve => {
        resolveScheduler = resolve;
      });
    },
    closeHttpServer: async () => events.push("http"),
    closeDatabase: async () => events.push("database")
  });

  const shutdownExecution = shutdown();

  await Promise.resolve();

  assert.deepEqual(events, ["scheduler"]);

  resolveScheduler();

  const result = await shutdownExecution;

  assert.deepEqual(events, [
    "scheduler",
    "http",
    "database"
  ]);

  assert.equal(result.success, true);
});

test("waits for HTTP server closure before closing the database", async () => {
  const events = [];
  let completeHttpShutdown;

  const shutdown = createShutdownCoordinator({
    stopScheduler: async () => {
      events.push("scheduler");
    },

    closeHttpServer: () => {
      events.push("http-started");

      return new Promise(resolve => {
        completeHttpShutdown = () => {
          events.push("http-completed");
          resolve();
        };
      });
    },

    closeDatabase: async () => {
      events.push("database");
    }
  });

  const shutdownExecution = shutdown();

  // Allow scheduler shutdown and HTTP shutdown to begin.
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(events, [
    "scheduler",
    "http-started"
  ]);

  // Database cleanup must not have started yet.
  assert.equal(events.includes("database"), false);

  // Simulate completion of HTTP server closure.
  completeHttpShutdown();

  const result = await shutdownExecution;

  assert.deepEqual(events, [
    "scheduler",
    "http-started",
    "http-completed",
    "database"
  ]);

  assert.equal(result.success, true);
});
