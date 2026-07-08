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
 *
 * Env vars: PORT, CHROME_PATH, ADO_ORG, ADO_PROJECT, KEEP_CHROME_OPEN,
 *           OLLAMA_URL, OLLAMA_MODEL, OPENAI_API_KEY, OPENAI_MODEL,
 *           CLAUDE_API_KEY, CLAUDE_MODEL, GOOGLE_API_KEY, GOOGLE_MODEL,
 *           OPENCODE_API_KEY, OPENCODE_URL, OPENCODE_MODEL
 */
"use strict";

require("dotenv").config();

const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const { registerLlmRoutes } = require("./llm-providers");
const { runOrchestratedPipeline, loadAgentPrompts, exportLogAsTxt } = require("./agent-pipeline");
const multer = require("multer");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const PORT = process.env.PORT || 3010;

const LOGS_DIR = path.join(__dirname, "logs");
try {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
} catch (err) {
  console.warn("Could not create logs directory:", err.message);
}

const recentLogs = new Map(); // runId -> audit log object

app.use(express.json({ limit: "2mb" }));

// Serve either the React build (if it exists) or the old public/ directory
const clientDist = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
} else {
  app.use(express.static(path.join(__dirname, "public")));
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
      "--remote-debugging-port=9222",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${path.join(os.tmpdir(), "ado-playwright")}`,
      adoUrl,
    ],
    { detached: true, stdio: "ignore" },
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
        escXml(text)
          .replace(/\n\n/g, "&lt;/P&gt;&lt;P&gt;")
          .replace(/\n/g, "&lt;BR/&gt;");
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

  const stepsXml =
    `<steps id="0" last="${steps.length}">` + stepElements + `</steps>`;

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
  const { scenarios = [], config: { org = "", project = "" } = {} } = req.body;

  initSseResponse(res);
  const send = sseSend(res);

  if (!scenarios.length) {
    send({ type: "error", message: "No scenarios provided." });
    res.end();
    return;
  }

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    if (!s.title || !Array.isArray(s.steps) || s.steps.length === 0) {
      send({
        type: "error",
        message: `Scenario [${i}] "${s.title || "(no title)"}" is missing title or steps array.`,
      });
      res.end();
      return;
    }
  }

  send({ type: "log", message: "Connecting to Chrome on port 9222…" });

  let browser, page;
  try {
    const { chromium } = require("playwright");
    browser = await chromium.connectOverCDP("http://localhost:9222");
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
        { url: adoApiUrl, payload },
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

    await page.waitForTimeout(300);
  }

  send({ type: "done", totalCreated, totalFailed });

  if (!process.env.KEEP_CHROME_OPEN) {
    try {
      await browser.close();
    } catch {
      console.warn("Failed to close browser");
    }
  }

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
  const { org, project, id } = req.body || {};
  if (!org || !project || !id) return res.status(400).json({ error: "org, project, and id are required" });

  let browser, page;
  try {
    const { chromium } = require("playwright");
    browser = await chromium.connectOverCDP("http://localhost:9222");
    const context = browser.contexts()[0] || (await browser.newContext());
    page = context.pages()[0] || (await context.newPage());

    const wiUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_workitems/edit/${encodeURIComponent(id)}`;
    await page.goto(wiUrl, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    const text = await page.evaluate(() => document.body.innerText);
    const title = await page.evaluate(() => {
      const h1 = document.querySelector('[aria-label="Work item title"]') || document.querySelector("h1");
      return h1 ? h1.innerText.trim() : "";
    });

    res.json({ ok: true, title, text: `Title: ${title}\n\n${text.slice(0, 50000)}` });
  } catch (err) {
    res.status(500).json({ error: `Cannot fetch work item: ${err.message}. Launch Chrome first and navigate to ADO.` });
  } finally {
    if (browser && !process.env.KEEP_CHROME_OPEN) {
      try { await browser.close(); } catch {}
    }
  }
});

// ─── Agents ───────────────────────────────────────────────────────────────────

app.get("/api/agents", (req, res) => {
  const agents = loadAgentPrompts();
  res.json({ agents: agents.map((a) => ({ id: a.id, name: a.name })) });
});

app.post("/api/agents/run", async (req, res) => {
  const {
    input,
    provider: providerId = "ollama",
    providerConfig = {},
    mode = "regular",
    requirementId = "",
    ticketTitle = "",
    ticketNumber = "",
  } = req.body || {};
  if (!input || !input.trim()) {
    return res.status(400).json({ error: "Input text is required." });
  }

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
        onChunk(text) { if (text) onChunk(text); },
        onError(msg) { onError(msg); },
      });
      return usage;
    },
  });

  recentLogs.set(log.runId, log);
  try {
    const logPath = path.join(LOGS_DIR, `${log.runId}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch (err) {
    console.warn("Failed to persist audit log:", err.message);
  }

  if (!res.writableEnded) res.end();
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
      console.warn("Failed to read persisted audit log:", err.message);
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

app.listen(PORT, () => {
  console.log(`TestForge running at http://localhost:${PORT}`);
});
