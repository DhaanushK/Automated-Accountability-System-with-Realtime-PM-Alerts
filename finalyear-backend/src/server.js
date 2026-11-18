import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import connectDB from "./config/db.js";
import app from "./app.js";

import { createShutdownCoordinator } from "./lifecycle/shutdownCoordinator.js";
import {
  createShutdownHandler,
  registerShutdownSignals
} from "./lifecycle/shutdownHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../.env") });

let isShuttingDown = false;
let hasStartupFailed = false;
let server;
let stopAlertScheduler = null;

const PORT = Number(process.env.PORT) || 5002;

// Configure application resource shutdown.
const shutdown = createShutdownCoordinator({
  // 1. Stop scheduled work and drain active executions.
  stopScheduler: async () => {
    if (stopAlertScheduler) {
      await stopAlertScheduler();
      console.log("Alert scheduler stopped");
    }
  },

  // 2. Close the HTTP server.
  closeHttpServer: async () => {
    if (!server || !server.listening) return;

    await new Promise((resolve, reject) => {
      server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    });

    console.log("HTTP server closed");
  },

  // 3. Close MongoDB after dependent work has stopped.
  closeDatabase: async () => {
    await connectDB.disconnect();
    console.log("Database connection closed");
  }
});

// Configure signal handling, duplicate protection and force-exit timeout.
const shutdownGracefully = createShutdownHandler({
  shutdown,

  exit: code => process.exit(hasStartupFailed ? 1 : code),

  timeoutMs: 10000,

  onStart: () => {
    isShuttingDown = true;
    console.log("\nInitiating graceful shutdown...");
  },

  onTimeout: () => {
    console.error(
      "Could not close connections in time, forcefully shutting down"
    );
  },

  onError: error => {
    console.error("Unexpected shutdown failure:", error);
  }
});

// Register graceful shutdown handlers.
registerShutdownSignals(shutdownGracefully);

// Start the HTTP server with error handling.
const startServer = () => {
  if (isShuttingDown) {
    console.log(
      "[INFO] Server startup skipped because shutdown has begun."
    );
    return;
  }
  try {
    server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    server.on("error", error => {
      hasStartupFailed = true;
      if (error.code === "EADDRINUSE") {
        console.error(
          `Port ${PORT} is already in use. Set PORT to an available port and update the Vite proxy target.`
        );
      } else {
        console.error("Server error:", error);
      }

      void shutdownGracefully();
    });
  } catch (error) {
    hasStartupFailed = true;
    console.error("Failed to start server:", error);

    void shutdownGracefully();
  }
};

// Initialize database connection and local-only scheduler before listening.
(async () => {
  try {
    await connectDB();

    if (isShuttingDown) return;

    console.log("Database connected successfully");

    // Keep scheduler imports out of the import-safe Express application.
    const {
      initializeAlertScheduler,
      stopAlertScheduler: stopScheduler
    } = await import("./schedulers/alertScheduler.js");

    stopAlertScheduler = stopScheduler;

    if (isShuttingDown) return;

    if (process.env.ENABLE_ALERT_SCHEDULER === "false") {
      console.log(
        "[INFO] Alert scheduler disabled by configuration."
      );
    } else {
      initializeAlertScheduler();
    }

    if (isShuttingDown) return;

    startServer();
  } catch (error) {
    if (isShuttingDown) return;
    hasStartupFailed = true;
    console.error("Application startup failed:", error);

    void shutdownGracefully();
  }
})();
