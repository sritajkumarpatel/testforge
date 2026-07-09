/* global document */
"use strict";

/**
 * Azure DevOps (ADO) integration routes.
 *   POST /api/ado/launch-chrome    — opens local Chrome/Edge with CDP debugging
 *   POST /api/ado/run              — SSE: creates ADO test cases via browser CDP session
 *   POST /api/ado/run-pat          — SSE: creates ADO test cases via server-side PAT
 *   POST /api/ado/fetch-work-item  — scrapes a work item description from ADO
 */

const { Router } = require("express");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const config = require("../config");
const logger = require("../logger");
const { adoRunSchema, adoWorkItemSchema, validate } = require("../validators");
const { findChrome } = require("../services/chrome");
const { buildTestCasePayload } = require("../services/ado-payload");
const { initSseResponse, sseSend } = require("../middleware/sse");

const router = Router();

// ─── POST /api/ado/launch-chrome ─────────────────────────────────────────────

router.post("/launch-chrome", (req, res) => {
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

// ─── POST /api/ado/run (SSE — browser CDP session) ────────────────────────────

router.post("/run", async (req, res) => {
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
    const payload = buildTestCasePayload(tc.title, tc.steps, tc.tags, tc);

    try {
      const result = await page.evaluate(
        async ({ url, payload: p }) => {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json-patch+json" },
            body: JSON.stringify(p),
            credentials: "include",
          });
          const body = await r.json().catch(() => ({}));
          return { status: r.status, id: body.id, adoUrl: body._links?.html?.href };
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

// ─── POST /api/ado/run-pat (SSE — server-side PAT) ───────────────────────────

router.post("/run-pat", async (req, res) => {
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
  const createUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/$Test%20Case?api-version=7.1`;

  let totalCreated = 0;
  let totalFailed = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const tc = scenarios[i];
    const payload = buildTestCasePayload(tc.title, tc.steps, tc.tags, tc);

    try {
      const r = await fetch(createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json-patch+json", Authorization: authHeader },
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

// ─── POST /api/ado/fetch-work-item ────────────────────────────────────────────

router.post("/fetch-work-item", async (req, res) => {
  const validation = validate(adoWorkItemSchema, req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.errors.join("; ") });
  }

  const { org, project, id } = validation.data;

  let browser;
  try {
    const { chromium } = require("playwright");
    browser = await chromium.connectOverCDP(`http://localhost:${config.chrome.cdpPort}`);
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());

    const wiUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_workitems/edit/${encodeURIComponent(id)}`;
    await page.goto(wiUrl, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    const text = await page.evaluate(() => document.body.innerText);
    const title = await page.evaluate(() => {
      const el =
        document.querySelector('[aria-label="Work item title"]') || document.querySelector("h1");
      return el ? el.innerText.trim() : "";
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
      } catch {
        /* ignore */
      }
    }
  }
});

module.exports = router;
