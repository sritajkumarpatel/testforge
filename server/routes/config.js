"use strict";

/**
 * Config API route.
 *   GET /api/config — returns environment defaults and available LLM providers
 */

const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const { getProviders } = require("../llm-providers");

const router = Router();

router.get("/config", (req, res) => {
  const providers = getProviders();

  let envExample = "";
  try {
    // .env.example lives at project root (two levels up from server/routes/)
    envExample = fs.readFileSync(path.join(__dirname, "../../.env.example"), "utf-8");
  } catch { /* optional file */ }

  let version = "2.0.0";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8"));
    version = pkg.version || version;
  } catch { /* fallback to hardcoded */ }

  const isSecretField = (field) => field.type === "password" || field.key === "apiKey";

  res.json({
    version,
    org: process.env.ADO_ORG || "",
    project: process.env.ADO_PROJECT || "",
    chromePath: process.env.CHROME_PATH || "",
    adoPatAvailable: !!process.env.ADO_PAT,
    providers: Object.values(providers).map((p) => ({
      id: p.id,
      name: p.name,
      defaultModel: p.defaultModel,
      models: p.models,
      configFields: p.configFields.map((f) => ({
        ...f,
        envValue: isSecretField(f) ? "" : f.defaultValue,
      })),
    })),
    env: {
      PORT: process.env.PORT || "3010",
      ADO_ORG: process.env.ADO_ORG || "",
      ADO_PROJECT: process.env.ADO_PROJECT || "",
      CHROME_PATH: process.env.CHROME_PATH || "",
      OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434",
      OLLAMA_MODEL: process.env.OLLAMA_MODEL || "llama3.2",
      OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o",
      CLAUDE_MODEL: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
      GOOGLE_MODEL: process.env.GOOGLE_MODEL || "gemini-2.0-flash",
      OPENCODE_URL: process.env.OPENCODE_URL || "",
      OPENCODE_MODEL: process.env.OPENCODE_MODEL || "deepseek-v4-flash-free",
    },
    envExample,
  });
});

module.exports = router;
