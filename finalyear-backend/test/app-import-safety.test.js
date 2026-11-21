import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { dirname, resolve } from "node:path";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Express app import is side-effect-free and all daily operations stay disabled", () => {
  const script = String.raw`
    import assert from "node:assert/strict";
    import express from "express";
    import mongoose from "mongoose";
    import dotenv from "dotenv";
    import cron from "node-cron";
    import nodemailer from "nodemailer";
    import { google } from "googleapis";
    import jwt from "jsonwebtoken";
    import { Readable } from "node:stream";
    import http from "node:http";
    import https from "node:https";
    import net from "node:net";
    import tls from "node:tls";
    import User from "./src/models/User.js";

    const observedSignals = [];
    const externalCalls = {
      listen: 0, connect: 0, dotenv: 0, exit: 0, cron: 0, mail: 0,
      google: 0, network: 0, databaseQuery: 0, databaseWrite: 0
    };
    const restoreActions = [];
    const originalSecret = process.env.JWT_SECRET;
    const originalProcessOn = process.on;

    function patch(target, key, replacement) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      restoreActions.push(() => {
        if (descriptor) Object.defineProperty(target, key, descriptor);
        else delete target[key];
      });
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        writable: true,
        value: replacement
      });
    }

    function restoreAll() {
      const errors = [];
      for (const restore of restoreActions.reverse()) {
        try { restore(); } catch (error) { errors.push(error); }
      }
      if (originalSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalSecret;
      if (errors.length) throw new AggregateError(errors, "Test instrumentation restoration failed");
    }

    function dispatchInProcess(app, { method = "GET", url = "/", headers = {}, body } = {}) {
      const req = Readable.from(body ? [body] : []);
      Object.setPrototypeOf(req, express.request);
      Object.assign(req, {
        method, url, originalUrl: url, baseUrl: "", headers,
        httpVersion: "1.1", httpVersionMajor: 1, httpVersionMinor: 1,
        complete: true, connection: {}, socket: {}, app, res: undefined
      });

      const res = new http.ServerResponse(req);
      Object.setPrototypeOf(res, express.response);
      res.app = app;
      res.req = req;
      req.res = res;

      return new Promise((resolve, reject) => {
        const chunks = [];
        res.write = chunk => {
          if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          return true;
        };
        res.end = chunk => {
          if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({ status: res.statusCode, body: text ? JSON.parse(text) : undefined });
          } catch (error) {
            reject(new Error("Express response was not valid JSON: " + text, { cause: error }));
          }
          return res;
        };
        app.handle(req, res, error => {
          if (error) reject(error);
          else if (!res.writableEnded) reject(new Error("Express completed without ending the response"));
        });
      });
    }

    try {
      patch(express.application, "listen", function () {
        externalCalls.listen += 1;
        throw new Error("app import attempted to open an HTTP listener");
      });
      patch(mongoose, "connect", async function () {
        externalCalls.connect += 1;
        throw new Error("app import attempted to connect to MongoDB");
      });
      patch(dotenv, "config", function () {
        externalCalls.dotenv += 1;
        throw new Error("app import attempted to load dotenv");
      });
      patch(cron, "schedule", function () {
        externalCalls.cron += 1;
        throw new Error("app import attempted to initialize the scheduler");
      });
      patch(nodemailer, "createTransport", function () {
        externalCalls.mail += 1;
        throw new Error("app import attempted to initialize email delivery");
      });
      for (const key of ["sheets", "gmail", "calendar", "drive"]) {
        patch(google, key, function () {
          externalCalls.google += 1;
          throw new Error("app import attempted to initialize a Google integration");
        });
      }
      for (const [target, key] of [
        [http, "request"], [http, "get"], [https, "request"], [https, "get"],
        [net, "connect"], [tls, "connect"]
      ]) {
        patch(target, key, function () {
          externalCalls.network += 1;
          throw new Error("app import attempted external network access");
        });
      }
      patch(mongoose.Query.prototype, "exec", function () {
        externalCalls.databaseQuery += 1;
        throw new Error("test attempted a MongoDB query");
      });
      patch(mongoose.Model.prototype, "save", function () {
        externalCalls.databaseWrite += 1;
        throw new Error("test attempted a MongoDB write");
      });
      patch(mongoose.Model, "create", function () {
        externalCalls.databaseWrite += 1;
        throw new Error("test attempted a MongoDB write");
      });
      patch(process, "on", function (event, ...args) {
        if (["SIGINT", "SIGTERM", "beforeExit", "exit", "uncaughtException", "unhandledRejection"].includes(event)) {
          observedSignals.push(event);
        }
        return originalProcessOn.call(this, event, ...args);
      });
      patch(process, "exit", function () {
        externalCalls.exit += 1;
        throw new Error("app import attempted to exit the process");
      });

      const { default: app } = await import("./src/app.js");
      assert.equal(typeof app, "function");
      assert.equal(typeof app.use, "function");
      assert.equal(typeof app.listen, "function");

      assert.equal(externalCalls.listen, 0);
      assert.equal(externalCalls.connect, 0);
      assert.equal(externalCalls.dotenv, 0);
      assert.equal(externalCalls.exit, 0);
      assert.equal(externalCalls.cron, 0);
      assert.equal(externalCalls.mail, 0);
      assert.equal(externalCalls.google, 0);
      assert.equal(externalCalls.network, 0);
      assert.equal(externalCalls.databaseQuery, 0);
      assert.equal(externalCalls.databaseWrite, 0);
      assert.deepEqual(observedSignals, []);

      const stack = app._router.stack;
      assert.deepEqual(stack.slice(2, 8).map(layer => layer.handle.name), [
        "corsMiddleware",
        "securityHeaders",
        "compression",
        "requestLogger",
        "jsonParser",
        "urlencodedParser"
      ]);

      const mounts = stack
        .map(layer => layer.handle?.basePath)
        .filter(Boolean);
      assert.deepEqual(mounts, [
        "/api/auth",
        "/api/google",
        "/api/metrics",
        "/api/daily-submissions",
        "/api/logs",
        "/api/sheets",
        "/api/pm-email",
        "/api/tl-email",
        "/api/tm-email",
        "/api/emails",
        "/api/users",
        "/api/mailbox",
        "/api/internal-mailbox",
        "/api/calendar",
        "/api/tickets",
        "/api/alerts"
      ]);

      const firstMountIndex = stack.findIndex(layer => layer.handle?.basePath);
      assert.equal(firstMountIndex, 8);
      const errorHandler = stack.at(-1).handle;

      assert.equal(errorHandler.length, 4);
      assert.ok(stack.find(layer => layer.route?.path === "/"));
      assert.ok(stack.find(layer => layer.route?.path === "/calendar-authorize.html"));

      const connectionDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
      restoreActions.push(() => {
        if (connectionDescriptor) Object.defineProperty(mongoose.connection, "readyState", connectionDescriptor);
        else delete mongoose.connection.readyState;
      });
      Object.defineProperty(mongoose.connection, "readyState", {
        configurable: true, enumerable: connectionDescriptor?.enumerable ?? true,
        writable: true, value: 1
      });

      const originalFindByIdDescriptor = Object.getOwnPropertyDescriptor(User, "findById");
      restoreActions.push(() => {
        if (originalFindByIdDescriptor) Object.defineProperty(User, "findById", originalFindByIdDescriptor);
        else delete User.findById;
      });
      User.findById = id => ({
        select(fields) {
          if (fields === "email role name active") {
            return Promise.resolve({ _id: id, email: "offline@example.invalid", role: "team_member", name: "Offline", active: true });
          }
          return {
            lean: async () => ({
              _id: id, role: "team_member", active: true,
              teamId: null, managerId: null,
              employmentStartDate: null, employmentEndDate: null
            })
          };
        }
      });

      const secret = "offline-exported-app-test-secret";
      process.env.JWT_SECRET = secret;

      const authenticatedId = "64b000000000000000000001";
      const token = jwt.sign({ id: authenticatedId }, secret);
      const authHeaders = { authorization: "Bearer " + token };
      const currentDateParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
      }).formatToParts(new Date()).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
      const reportingDate = currentDateParts.year + "-" + currentDateParts.month + "-" + currentDateParts.day;
      const metrics = {
        ticketsAssigned: 1, ticketsResolved: 1, slaBreaches: 0,
        reopenedTickets: 0, clientInteractions: 0, remarks: "offline"
      };
      const cases = [
        { method: "GET", url: "/api/daily-submissions/me/current" },
        { method: "GET", url: "/api/daily-submissions/me/" + reportingDate },
        { method: "GET", url: "/api/daily-submissions/me/history?fromDate=" + reportingDate + "&toDate=" + reportingDate },
        { method: "POST", url: "/api/daily-submissions/", body: { reportingDate, metrics } },
        { method: "GET", url: "/api/daily-submissions/64b000000000000000000099" }
      ];

      for (const request of cases) {
        const body = request.body === undefined ? undefined : Buffer.from(JSON.stringify(request.body));
        const headers = { ...authHeaders };
        if (body) {
          headers["content-type"] = "application/json";
          headers["content-length"] = String(body.length);
        }
        const response = await dispatchInProcess(app, {
          method: request.method, url: request.url, headers, body
        });
        assert.equal(response.status, 501, request.method + " " + request.url);
        assert.equal(response.body.success, false);
        assert.equal(response.body.error.code, "NOT_IMPLEMENTED");
      }

      assert.equal(externalCalls.connect, 0);
      assert.equal(externalCalls.cron, 0);
      assert.equal(externalCalls.mail, 0);
      assert.equal(externalCalls.google, 0);
      assert.equal(externalCalls.network, 0);
      assert.equal(externalCalls.databaseQuery, 0);
      assert.equal(externalCalls.databaseWrite, 0);
    } finally {
      restoreAll();
    }
  `;

  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      cwd: backendRoot,
      encoding: "utf8",
      timeout: 15000
    }
  );

  assert.equal(
    result.status,
    0,
    `App import safety check failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
});
