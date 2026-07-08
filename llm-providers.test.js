"use strict";

const { getProviders } = require("./llm-providers");

function createReadableStream(lines) {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < lines.length) {
        controller.enqueue(encoder.encode(lines[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function mockFetch(responseBody) {
  return jest.fn().mockResolvedValue({
    ok: true,
    body: createReadableStream(responseBody),
  });
}

describe("getProviders", () => {
  test("returns all expected providers", () => {
    const providers = getProviders();
    expect(Object.keys(providers).sort()).toEqual([
      "claude",
      "google",
      "ollama",
      "openai",
      "opencode",
    ]);
  });

  test("each provider has required shape", () => {
    const providers = getProviders();
    for (const [id, provider] of Object.entries(providers)) {
      expect(provider.id).toBe(id);
      expect(provider.name).toBeTruthy();
      expect(provider.defaultModel).toBeTruthy();
      expect(Array.isArray(provider.models)).toBe(true);
      expect(Array.isArray(provider.configFields)).toBe(true);
      expect(typeof provider.generate).toBe("function");
    }
  });
});

describe("ollamaProvider.generate", () => {
  const provider = getProviders().ollama;

  test("returns exact usage when stream includes counts", async () => {
    global.fetch = mockFetch([
      JSON.stringify({ message: { role: "assistant", content: "Hello" }, done: false }) + "\n",
      JSON.stringify({
        message: { role: "assistant", content: "" },
        done: true,
        prompt_eval_count: 10,
        eval_count: 5,
      }) + "\n",
    ]);

    const chunks = [];
    const usage = await provider.generate({
      systemPrompt: "sys",
      userMessage: "hi",
      onChunk: (text) => chunks.push(text),
      onError: (msg) => {
        throw new Error(msg);
      },
    });

    expect(usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(chunks).toEqual(["Hello"]);
  });

  test("returns unsupported reason when counts are missing", async () => {
    global.fetch = mockFetch([
      JSON.stringify({ message: { role: "assistant", content: "Hi" }, done: true }) + "\n",
    ]);

    const usage = await provider.generate({
      systemPrompt: "sys",
      userMessage: "hi",
      onChunk: () => {},
      onError: (msg) => {
        throw new Error(msg);
      },
    });

    expect(usage.unsupported).toBe(true);
    expect(usage.reason).toContain("Ollama did not expose usage metadata");
  });

  test("returns unsupported reason on network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Connection refused"));

    const errors = [];
    const usage = await provider.generate({
      systemPrompt: "sys",
      userMessage: "hi",
      onChunk: () => {},
      onError: (msg) => errors.push(msg),
    });

    expect(usage.unsupported).toBe(true);
    expect(errors.length).toBe(1);
  });
});

describe("openaiProvider.generate", () => {
  const provider = getProviders().openai;

  test("returns unsupported reason when usage is not in stream", async () => {
    global.fetch = mockFetch([
      "data: " + JSON.stringify({ choices: [{ delta: { content: "Hello" } }] }) + "\n\n",
      "data: [DONE]\n\n",
    ]);

    const chunks = [];
    const usage = await provider.generate({
      systemPrompt: "sys",
      userMessage: "hi",
      apiKey: "sk-test",
      onChunk: (text) => chunks.push(text),
      onError: (msg) => {
        throw new Error(msg);
      },
    });

    expect(usage.unsupported).toBe(true);
    expect(chunks).toEqual(["Hello"]);
  });
});
