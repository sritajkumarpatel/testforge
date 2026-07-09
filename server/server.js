/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  TestForge — server.js  (entry point)                                    ║
 * ║  © 2026 Sritaj Kumar Patel                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Endpoints (delegated to route modules):
 *   GET  /health, /ready
 *   GET  /api/config
 *   POST /api/llm/generate
 *   POST /api/ado/launch-chrome, /run, /run-pat, /fetch-work-item
 *   GET  /api/agents
 *   POST /api/agents/run
 *   GET  /api/agents/run/:runId/status
 *   GET  /api/agents/run/:runId/export
 *   POST /api/parse/document
 */
"use strict";

require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const config = require("./config");
const logger = require("./logger");
const { requireAuth } = require("./middleware/auth");
const { registerLlmRoutes } = require("./llm-providers");

// ─── Route modules ────────────────────────────────────────────────────────────
const healthRouter = require("./routes/health");
const configRouter = require("./routes/config");
const adoRouter = require("./routes/ado");
const agentsRouter = require("./routes/agents");
const documentsRouter = require("./routes/documents");

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
const PORT = config.port;

// Security headers — relax CSP slightly to allow Vite dev HMR in development
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "connect-src": ["'self'", "http://localhost:*", "ws://localhost:*"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
      },
    },
  })
);

// CORS — configurable per environment, default to permissive for local dev
app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin, credentials: true }));

// Body parsing
app.use(express.json({ limit: config.maxJsonBodySize }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () =>
    logger.info(
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      },
      "request"
    )
  );
  next();
});

// Ensure logs directory exists
try {
  if (!fs.existsSync(config.logsDirPath)) fs.mkdirSync(config.logsDirPath, { recursive: true });
} catch (err) {
  logger.warn({ err: err.message }, "Could not create logs directory");
}

// ─── Public routes (no auth) ──────────────────────────────────────────────────
app.use("/", healthRouter);

// Serve React build in production
const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// ─── Protected API routes ─────────────────────────────────────────────────────
const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.generalRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

app.use("/api", generalRateLimiter);
app.use("/api", requireAuth);

// Mount route modules
app.use("/api", configRouter);
app.use("/api/ado", adoRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/parse", documentsRouter);

// LLM provider routes (POST /api/llm/generate — kept in llm-providers.js)
registerLlmRoutes(app);

// SPA fallback for React client-side routing
if (fs.existsSync(clientDist)) {
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) res.sendFile(path.join(clientDist, "index.html"));
  });
}

// ─── Start & graceful shutdown ────────────────────────────────────────────────
if (require.main === module) {
  const server = app.listen(PORT, () =>
    logger.info(`TestForge running at http://localhost:${PORT}`)
  );

  const exit = (code) => {
    // Graceful exit after connections are closed — disable lint rule for intentional exits
    /* eslint-disable no-process-exit */
    process.exit(code);
    /* eslint-enable no-process-exit */
  };

  const shutdown = (signal) => {
    logger.info({ signal }, "Graceful shutdown initiated");
    server.close(() => {
      logger.info("HTTP server closed");
      exit(0);
    });
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = { app };
