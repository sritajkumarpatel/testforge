"use strict";

/**
 * Health check routes.
 *   GET /health — liveness probe
 *   GET /ready  — readiness probe (checks logs directory)
 */

const { Router } = require("express");
const fs = require("fs");
const config = require("../config");
const logger = require("../logger");

const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get("/ready", (req, res) => {
  let logsWritable = false;
  try {
    fs.accessSync(config.logsDirPath, fs.constants.W_OK);
    logsWritable = true;
  } catch {
    logsWritable = false;
  }

  if (logsWritable) {
    res.json({ status: "ready", logsDir: config.logsDirPath });
  } else {
    res.status(503).json({ status: "not ready", reason: "logs directory not writable" });
  }
});

module.exports = router;
