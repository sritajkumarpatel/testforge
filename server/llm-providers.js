"use strict";

const fs = require("fs");
const path = require("path");
const logger = require("./logger");

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

function unsupportedUsage(reason) {
  return { unsupported: true, reason };
}

function exactUsage(inputTokens, outputTokens) {
  return { inputTokens, outputTokens };
}

function ollamaProvider() {
  return {
    id: "ollama",
    name: "Ollama (Local)",
    defaultModel: OLLAMA_DEFAULT_MODEL,
    models: [
      "llama3.2",
      "llama3.1",
      "llama3",
      "mistral",
      "mixtral",
      "codellama",
      "deepseek-coder",
      "phi",
      "qwen2.5",
    ],
    configFields: [
      {
        key: "baseUrl",
        label: "Base URL",
        type: "text",
        defaultValue: OLLAMA_BASE_URL,
        placeholder: "http://localhost:11434",
      },
      {
        key: "model",
        label: "Model",
        type: "text",
        defaultValue: OLLAMA_DEFAULT_MODEL,
        placeholder: "llama3.2",
      },
    ],
    async generate({ systemPrompt, userMessage, model, baseUrl, onChunk, onError }) {
      const url = (baseUrl || OLLAMA_BASE_URL).replace(/\/+$/, "");
      let res;
      try {
        res = await fetch(`${url}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: model || OLLAMA_DEFAULT_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            stream: true,
          }),
        });
      } catch (err) {
        onError(`Cannot reach Ollama at ${url} — ${err.message}. Make sure Ollama is running.`);
        return unsupportedUsage("Ollama request failed before usage could be captured");
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        onError(`Ollama returned ${res.status}: ${text.slice(0, 300)}`);
        return unsupportedUsage(`Ollama returned HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let promptEvalCount = null;
      let evalCount = null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const lines = decoder.decode(value, { stream: true }).split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (obj.message && obj.message.content) onChunk(obj.message.content);
              if (obj.done) {
                promptEvalCount = obj.prompt_eval_count ?? null;
                evalCount = obj.eval_count ?? null;
              }
            } catch {
              logger.warn({ line: line.slice(0, 100) }, "ollama: failed to parse NDJSON line");
            }
          }
        }
        if (promptEvalCount != null && evalCount != null) {
          return exactUsage(promptEvalCount, evalCount);
        }
        return unsupportedUsage("Ollama did not expose usage metadata for this stream");
      } catch (err) {
        onError(`Stream error: ${err.message}`);
        return unsupportedUsage(`stream error: ${err.message}`);
      }
    },
  };
}

function openaiProvider() {
  const apiKey = process.env.OPENAI_API_KEY || "";
  return {
    id: "openai",
    name: "OpenAI",
    defaultModel: process.env.OPENAI_MODEL || "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o3-mini"],
    configFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        defaultValue: apiKey ? "••••••" : "",
        placeholder: "sk-...",
      },
      {
        key: "model",
        label: "Model",
        type: "select",
        defaultValue: process.env.OPENAI_MODEL || "gpt-4o",
        options: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o3-mini"],
      },
      {
        key: "baseUrl",
        label: "Base URL (optional)",
        type: "text",
        defaultValue: "",
        placeholder: "https://api.openai.com/v1",
      },
    ],
    async generate({ systemPrompt, userMessage, model, apiKey: key, baseUrl, onChunk, onError }) {
      const effectiveKey = key || apiKey;
      if (!effectiveKey) {
        onError("OpenAI API key not configured. Set OPENAI_API_KEY in .env or in Settings.");
        return unsupportedUsage("API key missing");
      }
      const url =
        (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "") + "/chat/completions";
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${effectiveKey}` },
          body: JSON.stringify({
            model: model || "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            stream: true,
            stream_options: { include_usage: true },
          }),
        });
      } catch (err) {
        onError(`Cannot reach OpenAI: ${err.message}`);
        return unsupportedUsage(`network error: ${err.message}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        onError(`OpenAI returned ${res.status}: ${text.slice(0, 300)}`);
        return unsupportedUsage(`OpenAI returned HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let promptTokens = null;
      let completionTokens = null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n");
          buf = parts.pop();
          for (const part of parts) {
            const line = part.replace(/^data: /, "").trim();
            if (!line || line === "[DONE]") continue;
            try {
              const obj = JSON.parse(line);
              if (obj.usage) {
                promptTokens = obj.usage.prompt_tokens ?? promptTokens;
                completionTokens = obj.usage.completion_tokens ?? completionTokens;
              }
              const content = obj.choices?.[0]?.delta?.content || "";
              if (content) onChunk(content);
            } catch {
              logger.warn({ line: line.slice(0, 100) }, "openai: failed to parse SSE line");
            }
          }
        }
        if (promptTokens != null && completionTokens != null) {
          return exactUsage(promptTokens, completionTokens);
        }
        return unsupportedUsage("OpenAI did not include usage metadata in the stream");
      } catch (err) {
        onError(`Stream error: ${err.message}`);
        return unsupportedUsage(`stream error: ${err.message}`);
      }
    },
  };
}

function claudeProvider() {
  const apiKey = process.env.CLAUDE_API_KEY || "";
  return {
    id: "claude",
    name: "Anthropic Claude",
    defaultModel: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
    models: [
      "claude-sonnet-4-20250514",
      "claude-sonnet-4-20250202",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
    configFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        defaultValue: apiKey ? "••••••" : "",
        placeholder: "sk-ant-...",
      },
      {
        key: "model",
        label: "Model",
        type: "select",
        defaultValue: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
        options: [
          "claude-sonnet-4-20250514",
          "claude-sonnet-4-20250202",
          "claude-3-5-sonnet-20241022",
          "claude-3-5-haiku-20241022",
          "claude-3-opus-20240229",
        ],
      },
    ],
    async generate({ systemPrompt, userMessage, model, apiKey: key, onChunk, onError }) {
      const effectiveKey = key || apiKey;
      if (!effectiveKey) {
        onError("Claude API key not configured. Set CLAUDE_API_KEY in .env or in Settings.");
        return unsupportedUsage("API key missing");
      }
      let res;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": effectiveKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: model || "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
            stream: true,
          }),
        });
      } catch (err) {
        onError(`Cannot reach Claude: ${err.message}`);
        return unsupportedUsage(`network error: ${err.message}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        onError(`Claude returned ${res.status}: ${text.slice(0, 300)}`);
        return unsupportedUsage(`Claude returned HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n");
          buf = parts.pop();
          for (const part of parts) {
            const line = part.replace(/^data: /, "").trim();
            if (!line || line === "[DONE]") continue;
            try {
              const obj = JSON.parse(line);
              if (obj.type === "content_block_delta" && obj.delta?.text) {
                onChunk(obj.delta.text);
              }
            } catch {
              logger.warn({ line: line.slice(0, 100) }, "claude: failed to parse SSE line");
            }
          }
        }
        return unsupportedUsage("Claude streaming API does not expose token usage metadata");
      } catch (err) {
        onError(`Stream error: ${err.message}`);
        return unsupportedUsage(`stream error: ${err.message}`);
      }
    },
  };
}

function googleProvider() {
  const apiKey = process.env.GOOGLE_API_KEY || "";
  return {
    id: "google",
    name: "Google Gemini",
    defaultModel: process.env.GOOGLE_MODEL || "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"],
    configFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        defaultValue: apiKey ? "••••••" : "",
        placeholder: "AIza...",
      },
      {
        key: "model",
        label: "Model",
        type: "select",
        defaultValue: process.env.GOOGLE_MODEL || "gemini-2.0-flash",
        options: [
          "gemini-2.0-flash",
          "gemini-2.0-flash-lite",
          "gemini-1.5-pro",
          "gemini-1.5-flash",
        ],
      },
    ],
    async generate({ systemPrompt, userMessage, model, apiKey: key, onChunk, onError }) {
      const effectiveKey = key || apiKey;
      if (!effectiveKey) {
        onError("Google API key not configured. Set GOOGLE_API_KEY in .env or in Settings.");
        return unsupportedUsage("API key missing");
      }
      const effectiveModel = model || "gemini-2.0-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(effectiveKey)}`;
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
          }),
        });
      } catch (err) {
        onError(`Cannot reach Google Gemini: ${err.message}`);
        return unsupportedUsage(`network error: ${err.message}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        onError(`Gemini returned ${res.status}: ${text.slice(0, 300)}`);
        return unsupportedUsage(`Gemini returned HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let promptTokens = null;
      let candidatesTokens = null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n");
          buf = parts.pop();
          for (const part of parts) {
            const line = part.replace(/^data: /, "").trim();
            if (!line) continue;
            try {
              const obj = JSON.parse(line);
              const meta = obj.usageMetadata;
              if (meta) {
                promptTokens = meta.promptTokenCount ?? promptTokens;
                candidatesTokens = meta.candidatesTokenCount ?? candidatesTokens;
              }
              const text = obj.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (text) onChunk(text);
            } catch {
              logger.warn({ line: line.slice(0, 100) }, "google: failed to parse SSE line");
            }
          }
        }
        if (promptTokens != null && candidatesTokens != null) {
          return exactUsage(promptTokens, candidatesTokens);
        }
        return unsupportedUsage("Gemini did not include usage metadata in the stream");
      } catch (err) {
        onError(`Stream error: ${err.message}`);
        return unsupportedUsage(`stream error: ${err.message}`);
      }
    },
  };
}

function opencodeProvider() {
  const apiKey = process.env.OPENCODE_API_KEY || "";
  const baseUrl = process.env.OPENCODE_URL || "";
  return {
    id: "opencode",
    name: "OpenCode",
    defaultModel: process.env.OPENCODE_MODEL || "deepseek-v4-flash-free",
    models: ["deepseek-v4-flash-free", "deepseek-v4", "deepseek-v3"],
    configFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        defaultValue: apiKey ? "••••••" : "",
        placeholder: "oc-...",
      },
      {
        key: "baseUrl",
        label: "API URL",
        type: "text",
        defaultValue: baseUrl,
        placeholder: "https://api.opencode.ai/v1",
      },
      {
        key: "model",
        label: "Model",
        type: "select",
        defaultValue: process.env.OPENCODE_MODEL || "deepseek-v4-flash-free",
        options: ["deepseek-v4-flash-free", "deepseek-v4", "deepseek-v3"],
      },
    ],
    async generate({
      systemPrompt,
      userMessage,
      model,
      apiKey: key,
      baseUrl: url,
      onChunk,
      onError,
    }) {
      const effectiveKey = key || apiKey;
      if (!effectiveKey) {
        onError("OpenCode API key not configured.");
        return unsupportedUsage("API key missing");
      }
      const effectiveUrl =
        (url || baseUrl || "https://api.opencode.ai/v1").replace(/\/+$/, "") + "/chat/completions";
      let res;
      try {
        res = await fetch(effectiveUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${effectiveKey}` },
          body: JSON.stringify({
            model: model || "deepseek-v4-flash-free",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            stream: true,
            stream_options: { include_usage: true },
          }),
        });
      } catch (err) {
        onError(`Cannot reach OpenCode: ${err.message}`);
        return unsupportedUsage(`network error: ${err.message}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        onError(`OpenCode returned ${res.status}: ${text.slice(0, 300)}`);
        return unsupportedUsage(`OpenCode returned HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let promptTokens = null;
      let completionTokens = null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n");
          buf = parts.pop();
          for (const part of parts) {
            const line = part.replace(/^data: /, "").trim();
            if (!line || line === "[DONE]") continue;
            try {
              const obj = JSON.parse(line);
              if (obj.usage) {
                promptTokens = obj.usage.prompt_tokens ?? promptTokens;
                completionTokens = obj.usage.completion_tokens ?? completionTokens;
              }
              const content = obj.choices?.[0]?.delta?.content || "";
              if (content) onChunk(content);
            } catch {
              logger.warn({ line: line.slice(0, 100) }, "opencode: failed to parse SSE line");
            }
          }
        }
        if (promptTokens != null && completionTokens != null) {
          return exactUsage(promptTokens, completionTokens);
        }
        return unsupportedUsage("OpenCode did not include usage metadata in the stream");
      } catch (err) {
        onError(`Stream error: ${err.message}`);
        return unsupportedUsage(`stream error: ${err.message}`);
      }
    },
  };
}

const PROVIDERS = {
  ollama: ollamaProvider(),
  openai: openaiProvider(),
  claude: claudeProvider(),
  google: googleProvider(),
  opencode: opencodeProvider(),
};

function getProviders() {
  return PROVIDERS;
}

function registerLlmRoutes(app) {
  const providers = PROVIDERS;

  app.get("/api/config", (req, res) => {
    let envExample = "";
    try {
      envExample = fs.readFileSync(path.join(__dirname, ".env.example"), "utf-8");
    } catch { }
    let version = "2.0.0";
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf-8"));
      version = pkg.version || version;
    } catch { }

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

  app.post("/api/llm/generate", async (req, res) => {
    const {
      provider: providerId,
      model,
      systemPrompt,
      userMessage,
      config: providerConfig = {},
    } = req.body;
    if (!userMessage) {
      return res.status(400).json({ error: "userMessage is required" });
    }
    const provider = providers[providerId];
    if (!provider) {
      return res.status(400).json({
        error: `Unknown provider "${providerId}". Available: ${Object.keys(providers).join(", ")}`,
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    const usage = await provider.generate({
      systemPrompt: systemPrompt || "",
      userMessage,
      model: model || provider.defaultModel,
      ...providerConfig,
      onChunk(text) {
        send({ type: "chunk", text });
      },
      onError(msg) {
        send({ type: "error", message: msg });
        res.end();
      },
    });

    send({ type: "done", usage });
    if (!res.writableEnded) res.end();
  });
}

module.exports = { registerLlmRoutes, getProviders };
