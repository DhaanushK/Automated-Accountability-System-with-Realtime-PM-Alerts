import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import connectDB from "./config/db.js";
import app from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

// Initialize database connection and local-only scheduler before listening.
let isShuttingDown = false;
(async () => {
  try {
    await connectDB();

    if (isShuttingDown) return;

    console.log("Database connected successfully");

    // Keep scheduler imports out of the import-safe Express application.
    const { initializeAlertScheduler } = await import(
      "./schedulers/alertScheduler.js"
    );

    if (isShuttingDown) return;

    initializeAlertScheduler();

    if (isShuttingDown) return;

    startServer();
  } catch (error) {
    if (isShuttingDown) return;

    console.error(
      "Database connection failed:",
      error.message
    );

    console.error(
      "MongoDB URI:",
      process.env.MONGO_URI ? "Set" : "Not Set"
    );

    process.exit(1);
  }
})();

const PORT = Number(process.env.PORT) || 5002;
let server;

// Function to gracefully shutdown the server
const shutdownGracefully = async () => {
  if (isShuttingDown) return;

  isShuttingDown = true;
  console.log("\nInitiating graceful shutdown...");

  const forceExitTimer = setTimeout(() => {
    console.error(
      "Could not close connections in time, forcefully shutting down"
    );
    process.exit(1);
  }, 10000);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      });

      console.log("HTTP server closed");
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log("Database connection closed");
    }

    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    console.error("Graceful shutdown failed:", error.message);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
};

process.on("SIGINT", shutdownGracefully);
process.on("SIGTERM", shutdownGracefully);

// Start the server with error handling
const startServer = () => {
  try {
    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`⚠️ Port ${PORT} is already in use. Set PORT to an available port and update the Vite proxy target.`);
        process.exit(1);
      } else {
        console.error('Server error:', error);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};
