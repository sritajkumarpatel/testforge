"use strict";

const pino = require("pino");
const config = require("./config");

const logger = pino({
  level: config.logLevel,
  transport: config.nodeEnv === "production" ? undefined : { target: "pino-pretty" },
  base: {
    pid: process.pid,
    env: config.nodeEnv,
  },
});

module.exports = logger;
