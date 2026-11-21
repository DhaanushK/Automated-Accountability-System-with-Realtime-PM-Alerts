import express from "express";
import cors from "cors";
import compression from "compression";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import * as dailySubmissionReadService from "./services/dailySubmissionReadService.js";
import { createDailySubmissionController } from "./controllers/dailySubmissionController.js";
import { createDailySubmissionRouter } from "./routes/dailySubmissionRoutes.js";
import { isDailySubmissionReadReady } from "./services/dailySubmissionReadiness.js";
import { formatSubmissionError } from "./services/dailySubmissionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createLazyRouter(basePath, loadModule) {
  let routerPromise;

  const middleware = (req, res, next) => {
    if (!routerPromise) {
      routerPromise = Promise.resolve()
        .then(loadModule)
        .then(module => module.default)
        .catch(error => {
          routerPromise = undefined;
          throw error;
        });
    }

    routerPromise
      .then(router => router(req, res, next))
      .catch(next);
  };

  middleware.basePath = basePath;
  return middleware;
}

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
}

function requestLogger(req, res, next) {
  console.log(`${req.method} ${req.url}`, {
    method: req.method,
    path: req.path
  });
  next();
}

const app = express();

// CORS Configuration - Allow multiple dev ports
app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma", "Accept"],
  exposedHeaders: ["Content-Length", "Content-Type"]
}));

app.use(securityHeaders);

// Add compression middleware
app.use(compression());

// Request logging middleware
app.use(requestLogger);

// Parse JSON payloads
app.use(express.json({
  limit: "50mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Parse URL-encoded bodies
app.use(express.urlencoded({
  extended: true,
  limit: "50mb"
}));

// Keep imports of integration-heavy legacy routers lazy. This lets importing
// the Express app remain side-effect-free while preserving local route mounts.
const localRouterMounts = [
  ["/api/auth", () => import("./routes/authRoutes.js")],
  ["/api/google", () => import("./routes/googleAuthRoutes.js")],
  ["/api/metrics", () => import("./routes/metricsRoutes.js")],
  ["/api/daily-submissions", () => ({
    default: createDailySubmissionRouter({
      controllers: createDailySubmissionController({
        readService: dailySubmissionReadService,
        enableSelfServiceReads: false
      }),
      isStoreReady: isDailySubmissionReadReady
    })
  })],
  ["/api/logs", () => import("./routes/logsRoutes.js")],
  ["/api/sheets", () => import("./routes/sheetRoutes.js")],
  ["/api/pm-email", () => import("./routes/projectManagerEmailRoutes.js")],
  ["/api/tl-email", () => import("./routes/teamLeaderEmailRoutes.js")],
  ["/api/tm-email", () => import("./routes/teamMemberEmailRoutes.js")],
  ["/api/emails", () => import("./routes/emailRoutes.js")],
  ["/api/users", () => import("./routes/userRoutes.js")],
  ["/api/mailbox", () => import("./routes/mailboxRoutes.js")],
  ["/api/internal-mailbox", () => import("./routes/internalMailRoutes.js")],
  ["/api/calendar", () => import("./routes/calendarRoutes.js")],
  ["/api/tickets", () => import("./routes/ticketRoutes.js")],
  ["/api/alerts", () => import("./routes/alertRoutes.js")]
];

for (const [basePath, loadModule] of localRouterMounts) {
  app.use(basePath, createLazyRouter(basePath, loadModule));
}

// Serve static authorization page
app.get("/calendar-authorize.html", (req, res) => {
  res.sendFile(join(__dirname, "../calendar-authorize.html"));
});

app.get("/", (req, res) => {
  res.send("API is running...");
});

// Global error handling middleware
app.use((err, req, res, next) => {
  if (req.standardApiErrors) {
    const formatted = formatSubmissionError(err);
    if (formatted.status >= 500) console.error("[daily-submissions] Request failed:", err?.name || "Error");
    return res.status(formatted.status).json(formatted.body);
  }
  console.error("[API] Request failed:", {
  method: req.method,
  path: req.path,
  errorName: err?.name || "Error",
  statusCode: err?.status || 500
  });

  // Set CORS headers
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");

  // Handle specific types of errors
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }

  if (err.name === "UnauthorizedError") {
    return res.status(401).json({ message: "Invalid token" });
  }

  // Default error response
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
});

export default app;
