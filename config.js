"use strict";

/**
 * Central server configuration.
 * Values are read from environment variables with sensible defaults.
 */

const config = {
  /** Server port */
  port: Number(process.env.PORT) || 3010,

  /** Maximum JSON body size in bytes */
  maxJsonBodySize: process.env.MAX_JSON_BODY_SIZE || "2mb",

  /** Maximum uploaded file size in bytes */
  maxFileSize: Number(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,

  /** Directory for persisted logs and run state */
  logsDir: process.env.LOGS_DIR || "logs",

  /** Logs directory path resolved from project root */
  get logsDirPath() {
    return require("path").join(__dirname, this.logsDir);
  },

  /** LLM call timeout in milliseconds */
  agentTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS) || 60000,

  /** Maximum LLM call retry attempts (total attempts = maxRetries + 1) */
  agentMaxRetries: Number(process.env.AGENT_MAX_RETRIES) || 2,

  /** Maximum input length for pipeline requests */
  maxInputLength: Number(process.env.MAX_INPUT_LENGTH) || 50000,

  /** Maximum system prompt length */
  maxSystemPromptLength: Number(process.env.MAX_SYSTEM_PROMPT_LENGTH) || 100000,

  /** Maximum number of ADO test cases per bulk creation request */
  maxAdoScenarios: Number(process.env.MAX_ADO_SCENARIOS) || 500,

  /** Delay between ADO work item creation requests in milliseconds */
  adoCreationDelayMs: Number(process.env.ADO_CREATION_DELAY_MS) || 300,

  /** Rate limit: pipeline requests per minute */
  pipelineRateLimitMax: Number(process.env.PIPELINE_RATE_LIMIT_MAX) || 10,

  /** Rate limit: general API requests per minute */
  generalRateLimitMax: Number(process.env.GENERAL_RATE_LIMIT_MAX) || 60,

  /** Optional bearer token for API authentication */
  authToken: process.env.AUTH_TOKEN || "",

  /** Azure DevOps settings */
  ado: {
    org: process.env.ADO_ORG || "",
    project: process.env.ADO_PROJECT || "",
    pat: process.env.ADO_PAT || "",
  },

  /** Chrome settings */
  chrome: {
    path: process.env.CHROME_PATH || "",
    keepOpen: process.env.KEEP_CHROME_OPEN === "true",
    cdpPort: Number(process.env.CHROME_CDP_PORT) || 9222,
  },

  /** Logging */
  logLevel: process.env.LOG_LEVEL || "info",

  /** Node environment */
  nodeEnv: process.env.NODE_ENV || "development",
};

module.exports = config;
