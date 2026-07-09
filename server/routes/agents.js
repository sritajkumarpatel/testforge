"use strict";

/**
 * Agent pipeline routes.
 *   GET  /api/agents                        — list available AI agents
 *   POST /api/agents/run                    — SSE: run the multi-agent generation pipeline
 *   GET  /api/agents/run/:runId/status      — poll run status
 *   GET  /api/agents/run/:runId/export      — download audit log as .txt
 */

const { Router } = require("express");
const path = require("path");
const fs = require("fs");
const LRUCache = require("lru-cache");
const rateLimit = require("express-rate-limit");
const config = require("../config");
const logger = require("../logger");
const { runPipelineSchema, validate } = require("../validators");
const { runOrchestratedPipeline, loadAgentPrompts, exportLogAsTxt } = require("../agent-pipeline");
const { initSseResponse, sseSend } = require("../middleware/sse");

const router = Router();
const LOGS_DIR = config.logsDirPath;

// LRU cache prevents unbounded memory growth (replaces old in-memory Map)
const recentLogs = new LRUCache({ max: 200 });

const pipelineRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: config.pipelineRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many pipeline requests. Please slow down." },
});

// ─── GET /api/agents ──────────────────────────────────────────────────────────

router.get("/", (req, res) => {
  const agents = loadAgentPrompts();
  res.json({ agents: agents.map((a) => ({ id: a.id, name: a.name })) });
});

// ─── POST /api/agents/run (SSE stream) ────────────────────────────────────────

router.post("/run", pipelineRateLimiter, async (req, res) => {
  const validation = validate(runPipelineSchema, req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.errors.join("; ") });
  }

  const {
    input,
    provider: providerId = "ollama",
    providerConfig = {},
    mode = "regular",
    requirementId = "",
    ticketTitle = "",
    ticketNumber = "",
  } = validation.data;

  initSseResponse(res);
  const send = sseSend(res);

  const { getProviders } = require("../llm-providers");
  const providers = getProviders();
  const provider = providers[providerId];
  if (!provider) {
    send({ type: "error", message: `Unknown provider "${providerId}"` });
    res.end();
    return;
  }

  const model = providerConfig.model || provider.defaultModel;
  const metadata = {
    mode,
    provider: provider.name || providerId,
    model,
    requirementId,
    ticketTitle,
    ticketNumber,
  };

  const log = await runOrchestratedPipeline({
    send,
    userInput: input,
    mode,
    metadata,
    callLlm: async ({ systemPrompt, userMessage, onChunk, onError }) => {
      return provider.generate({
        systemPrompt: systemPrompt || "",
        userMessage,
        model,
        ...providerConfig,
        onChunk(text) {
          if (text) onChunk(text);
        },
        onError(msg) {
          onError(msg);
        },
      });
    },
  });

  recentLogs.set(log.runId, log);

  try {
    const logPath = path.join(LOGS_DIR, `${log.runId}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch (err) {
    logger.warn({ err: err.message }, "Failed to persist audit log");
  }

  if (!res.writableEnded) res.end();
});

// ─── GET /api/agents/run/:runId/status ───────────────────────────────────────

router.get("/run/:runId/status", (req, res) => {
  const { runId } = req.params;
  if (!runId || !/^tf-[\w-]+$/.test(runId)) {
    return res.status(400).json({ error: "Invalid runId." });
  }

  const log = recentLogs.get(runId);
  if (log) {
    return res.json({
      runId,
      status: "completed",
      completedAt: log.completedAt,
      classifierDecision: {
        decision: log.classifier.decision,
        reasoning: log.classifier.reasoning,
        plannedAgents: log.classifier.plan,
      },
      agents: log.agents.map((a) => ({ agentId: a.agentId, name: a.name, status: a.status })),
      finalOutput: log.finalOutput,
      logAvailable: true,
    });
  }

  const statePath = path.join(LOGS_DIR, `${runId}-state.json`);
  try {
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      return res.json(state);
    }
  } catch (err) {
    logger.warn({ runId, err: err.message }, "Failed to read run state");
  }

  return res.status(404).json({ error: "Run not found." });
});

// ─── GET /api/agents/run/:runId/export ───────────────────────────────────────

router.get("/run/:runId/export", (req, res) => {
  const { runId } = req.params;
  if (!runId || !/^tf-[\w-]+$/.test(runId)) {
    return res.status(400).json({ error: "Invalid runId." });
  }

  let log = recentLogs.get(runId);
  if (!log) {
    const logPath = path.join(LOGS_DIR, `${runId}.json`);
    try {
      if (fs.existsSync(logPath)) {
        log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      }
    } catch (err) {
      logger.warn({ err: err.message }, "Failed to read persisted audit log");
    }
  }

  if (!log) return res.status(404).json({ error: "Run log not found." });

  const txt = exportLogAsTxt(log);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${runId}-audit-log.txt"`);
  res.send(txt);
});

module.exports = router;
