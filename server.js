/* global document */
/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  TestForge — server.js                                                  ║
 * ║  © 2026 Sritaj Kumar Patel                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Express server (Node 18+). Endpoints:
 *
 *   GET  /api/config       — returns env defaults + available LLM providers
 *   POST /api/llm/generate — SSE: streams LLM output from any provider
 *   POST /api/ado/launch-chrome — spawns Chrome/Edge with CDP
 *   POST /api/ado/run      — SSE: creates Test Case work items via Playwright CDP
 *   POST /api/ado/run-pat  — SSE: creates Test Case work items via ADO PAT
 *
 * Env vars: PORT, CHROME_PATH, ADO_ORG, ADO_PROJECT, ADO_PAT, AUTH_TOKEN,
 *           KEEP_CHROME_OPEN, OLLAMA_URL, OLLAMA_MODEL, OPENAI_API_KEY,
 *           OPENAI_MODEL, CLAUDE_API_KEY, CLAUDE_MODEL, GOOGLE_API_KEY,
 *           GOOGLE_MODEL, OPENCODE_API_KEY, OPENCODE_URL, OPENCODE_MODEL
 */
"use strict";

require("dotenv").config();

const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const rateLimit = require("express-rate-limit");
const { registerLlmRoutes } = require("./llm-providers");
const { runOrchestratedPipeline, loadAgentPrompts, exportLogAsTxt } = require("./agent-pipeline");
const multer = require("multer");
const { runPipelineSchema, adoRunSchema, adoWorkItemSchema, validate } = require("./validators");
const logger = require("./logger");
const config = require("./config");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSize },
});
const PORT = config.port;
const AUTH_TOKEN = config.authToken;

const pipelineRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: config.pipelineRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many pipeline requests. Please slow down." },
});

const generalRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: config.generalRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return next();
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer" && parts[1] === AUTH_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized. Set Authorization: Bearer <token> header." });
}

const LOGS_DIR = config.logsDirPath;
try {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
} catch (err) {
  logger.warn({ err: err.message }, "Could not create logs directory");
}

const recentLogs = new Map(); // runId -> audit log object

app.use(express.json({ limit: config.maxJsonBodySize }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info(
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      },
      "request"
    );
  });
  next();
});

// ─── Health checks ───────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/ready", (req, res) => {
  let logsWritable = false;
  try {
    fs.accessSync(LOGS_DIR, fs.constants.W_OK);
    logsWritable = true;
  } catch {
    logsWritable = false;
  }

  if (logsWritable) {
    res.json({ status: "ready", logsDir: LOGS_DIR });
  } else {
    res.status(503).json({ status: "not ready", reason: "logs directory not writable" });
  }
});

app.use("/api", generalRateLimiter);
app.use("/api", requireAuth);

// Serve the React build (must be built before deployment)
const clientDist = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function initSseResponse(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

function sseSend(res) {
  return function send(obj) {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };
}

// ─── Chrome finder ────────────────────────────────────────────────────────────

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    ...(() => {
      const pf = process.env.PROGRAMFILES || "C:\\Program Files";
      const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
      const local = process.env.LOCALAPPDATA || "";
      return [
        path.join(pf, "Google\\Chrome\\Application\\chrome.exe"),
        path.join(pf86, "Google\\Chrome\\Application\\chrome.exe"),
        path.join(local, "Google\\Chrome\\Application\\chrome.exe"),
      ];
    })(),
    ...(() => {
      const pf = process.env.PROGRAMFILES || "C:\\Program Files";
      const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
      return [
        path.join(pf, "Microsoft\\Edge\\Application\\msedge.exe"),
        path.join(pf86, "Microsoft\\Edge\\Application\\msedge.exe"),
      ];
    })(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      fs.accessSync(p);
      return p;
    } catch {
      // path not found on this platform — continue
    }
  }
  return null;
}

// ─── POST /api/ado/launch-chrome ─────────────────────────────────────────────

app.post("/api/ado/launch-chrome", (req, res) => {
  const chromePath = findChrome();
  if (!chromePath) {
    return res.status(500).json({
      error:
        "Chrome / Edge not found. Set CHROME_PATH in your .env file to the full path of your browser executable.",
    });
  }

  const { org = "", project = "" } = req.body || {};
  const adoUrl =
    org && project
      ? `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`
      : "https://dev.azure.com";

  spawn(
    chromePath,
    [
      `--remote-debugging-port=${config.chrome.cdpPort}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${path.join(os.tmpdir(), "ado-playwright")}`,
      adoUrl,
    ],
    { detached: true, stdio: "ignore" }
  ).unref();

  res.json({ ok: true, url: adoUrl });
});

// ─── ADO payload builder ─────────────────────────────────────────────────────

function escXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildTestCasePayload(title, steps, tags) {
  const stepElements = steps
    .map((s, i) => {
      const fmt = (text) =>
        escXml(text).replace(/\n\n/g, "&lt;/P&gt;&lt;P&gt;").replace(/\n/g, "&lt;BR/&gt;");
      const action = fmt(s.action);
      const expected = fmt(s.expected);
      return (
        `<step id="${i + 1}" type="ValidateStep">` +
        `<parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;${action}&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>` +
        `<parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;${expected}&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>` +
        `<description/>` +
        `</step>`
      );
    })
    .join("");

  const stepsXml = `<steps id="0" last="${steps.length}">` + stepElements + `</steps>`;

  const ops = [
    { op: "add", path: "/fields/System.Title", value: title },
    { op: "add", path: "/fields/Microsoft.VSTS.TCM.Steps", value: stepsXml },
  ];

  if (tags && tags.length) {
    ops.push({
      op: "add",
      path: "/fields/System.Tags",
      value: tags.join("; "),
    });
  }

  return ops;
}

// ─── POST /api/ado/run (SSE stream) ──────────────────────────────────────────

app.post("/api/ado/run", async (req, res) => {
  const validation = validate(adoRunSchema, req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.errors.join("; ") });
  }

  const {
    scenarios,
    config: { org, project },
  } = validation.data;

  initSseResponse(res);
  const send = sseSend(res);

  send({ type: "log", message: `Connecting to Chrome on port ${config.chrome.cdpPort}…` });

  let browser, page;
  try {
    const { chromium } = require("playwright");
    browser = await chromium.connectOverCDP(`http://localhost:${config.chrome.cdpPort}`);
    const context = browser.contexts()[0] || (await browser.newContext());
    page = context.pages()[0] || (await context.newPage());

    if (!page.url().includes("dev.azure.com")) {
      const target =
        org && project
          ? `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`
          : "https://dev.azure.com";
      await page.goto(target);
      await page.waitForLoadState("networkidle");
    }
  } catch (err) {
    send({
      type: "error",
      message: `Cannot connect to Chrome: ${err.message}. Launch Chrome first and log in to ADO.`,
    });
    res.end();
    return;
  }

  send({
    type: "log",
    message: `Connected to ADO. Creating ${scenarios.length} test case${scenarios.length !== 1 ? "s" : ""}…`,
  });

  send({ type: "status", total: scenarios.length });

  let totalCreated = 0;
  let totalFailed = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const tc = scenarios[i];
    const adoApiUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/$Test%20Case?api-version=7.1`;
    const payload = buildTestCasePayload(tc.title, tc.steps, tc.tags);

    try {
      const result = await page.evaluate(
        async ({ url, payload }) => {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json-patch+json" },
            body: JSON.stringify(payload),
            credentials: "include",
          });
          const body = await r.json().catch(() => ({}));
          return {
            status: r.status,
            id: body.id,
            adoUrl: body._links?.html?.href,
          };
        },
        { url: adoApiUrl, payload }
      );

      if (result.status === 200 || result.status === 201) {
        totalCreated++;
        send({
          type: "case-done",
          index: i,
          title: tc.title,
          id: result.id,
          adoUrl: result.adoUrl,
          status: "created",
          tags: tc.tags || [],
        });
      } else {
        totalFailed++;
        send({
          type: "case-done",
          index: i,
          title: tc.title,
          status: "failed",
          httpStatus: result.status,
          tags: tc.tags || [],
        });
      }
    } catch (err) {
      totalFailed++;
      send({
        type: "case-done",
        index: i,
        title: tc.title,
        status: "error",
        error: err.message,
        tags: tc.tags || [],
      });
    }

    await page.waitForTimeout(config.adoCreationDelayMs);
  }

  send({ type: "done", totalCreated, totalFailed });

  if (!config.chrome.keepOpen) {
    try {
      await browser.close();
    } catch {
      logger.warn("Failed to close browser");
    }
  }

  res.end();
});

// ─── ADO bulk creation via PAT ───────────────────────────────────────────────

app.post("/api/ado/run-pat", async (req, res) => {
  const validation = validate(adoRunSchema, req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.errors.join("; ") });
  }

  const {
    scenarios,
    config: { org, project },
  } = validation.data;
  const pat = process.env.ADO_PAT;
  if (!pat) {
    return res.status(500).json({ error: "ADO_PAT environment variable is not configured." });
  }

  initSseResponse(res);
  const send = sseSend(res);

  send({ type: "log", message: `Creating ${scenarios.length} test case(s) via ADO PAT…` });
  send({ type: "status", total: scenarios.length });

  const authHeader = "Basic " + Buffer.from(":" + pat).toString("base64");
  const baseUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`;
  const createUrl = `${baseUrl}/_apis/wit/workitems/$Test%20Case?api-version=7.1`;

  let totalCreated = 0;
  let totalFailed = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const tc = scenarios[i];
    const payload = buildTestCasePayload(tc.title, tc.steps, tc.tags);

    try {
      const r = await fetch(createUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json-patch+json",
          Authorization: authHeader,
        },
        body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => ({}));

      if (r.status === 200 || r.status === 201) {
        totalCreated++;
        send({
          type: "case-done",
          index: i,
          title: tc.title,
          id: body.id,
          adoUrl: body._links?.html?.href,
          status: "created",
          tags: tc.tags || [],
        });
      } else {
        totalFailed++;
        send({
          type: "case-done",
          index: i,
          title: tc.title,
          status: "failed",
          httpStatus: r.status,
          tags: tc.tags || [],
        });
      }
    } catch (err) {
      totalFailed++;
      send({
        type: "case-done",
        index: i,
        title: tc.title,
        status: "error",
        error: err.message,
        tags: tc.tags || [],
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  send({ type: "done", totalCreated, totalFailed });
  res.end();
});

// ─── Document parsing ─────────────────────────────────────────────────────────

app.post("/api/parse/document", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided." });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = "";
    if (ext === ".pdf") {
      const { PDFParse } = require("pdf-parse");
      const parser = new PDFParse({ data: req.file.buffer });
      const result = await parser.getText();
      text = result.text;
    } else if (ext === ".docx") {
      const mammoth = require("mammoth");
      const data = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = data.value;
    } else {
      text = req.file.buffer.toString("utf-8");
    }
    res.json({ ok: true, text, filename: req.file.originalname, size: text.length });
  } catch (err) {
    res.status(500).json({ error: `Parse error: ${err.message}` });
  }
});

// ─── ADO work item fetcher ────────────────────────────────────────────────────

app.post("/api/ado/fetch-work-item", async (req, res) => {
  const validation = validate(adoWorkItemSchema, req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.errors.join("; ") });
  }

  const { org, project, id } = validation.data;

  let browser, page;
  try {
    const { chromium } = require("playwright");
    browser = await chromium.connectOverCDP(`http://localhost:${config.chrome.cdpPort}`);
    const context = browser.contexts()[0] || (await browser.newContext());
    page = context.pages()[0] || (await context.newPage());

    const wiUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_workitems/edit/${encodeURIComponent(id)}`;
    await page.goto(wiUrl, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    const text = await page.evaluate(() => document.body.innerText);
    const title = await page.evaluate(() => {
      const h1 =
        document.querySelector('[aria-label="Work item title"]') || document.querySelector("h1");
      return h1 ? h1.innerText.trim() : "";
    });

    res.json({ ok: true, title, text: `Title: ${title}\n\n${text.slice(0, 50000)}` });
  } catch (err) {
    res.status(500).json({
      error: `Cannot fetch work item: ${err.message}. Launch Chrome first and navigate to ADO.`,
    });
  } finally {
    if (browser && !config.chrome.keepOpen) {
      try {
        await browser.close();
      } catch {}
    }
  }
});

// ─── Agents ───────────────────────────────────────────────────────────────────

app.get("/api/agents", (req, res) => {
  const agents = loadAgentPrompts();
  res.json({ agents: agents.map((a) => ({ id: a.id, name: a.name })) });
});

app.post("/api/agents/run", pipelineRateLimiter, async (req, res) => {
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

  const { getProviders } = require("./llm-providers");
  const providers = getProviders();
  const provider = providers[providerId];
  if (!provider) {
    send({ type: "error", message: `Unknown provider "${providerId}"` });
    res.end();
    return;
  }

  const resolvedConfig = { ...providerConfig };
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
      const usage = await provider.generate({
        systemPrompt: systemPrompt || "",
        userMessage,
        model,
        ...resolvedConfig,
        onChunk(text) {
          if (text) onChunk(text);
        },
        onError(msg) {
          onError(msg);
        },
      });
      return usage;
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

app.get("/api/agents/run/:runId/status", async (req, res) => {
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

app.get("/api/agents/run/:runId/export", async (req, res) => {
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

  if (!log) {
    return res.status(404).json({ error: "Run log not found." });
  }

  const txt = exportLogAsTxt(log);
  const filename = `${runId}-audit-log.txt`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(txt);
});

// ─── LLM provider routes (unified) ───────────────────────────────────────────

registerLlmRoutes(app);

// SPA fallback: serve index.html for any non-API path (React client-side routing)
if (fs.existsSync(clientDist)) {
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(clientDist, "index.html"));
    }
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`TestForge running at http://localhost:${PORT}`);
  });
}

module.exports = { app };
