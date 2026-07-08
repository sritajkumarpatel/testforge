"use strict";

const { callLlmWithRetry } = require("./llm-caller");

describe("callLlmWithRetry", () => {
  test("returns usage on first successful call", async () => {
    const callLlm = jest.fn().mockResolvedValue({ inputTokens: 10, outputTokens: 5 });

    const usage = await callLlmWithRetry({
      callLlm,
      systemPrompt: "sys",
      userMessage: "hi",
      onChunk: () => {},
      onError: () => {},
      timeoutMs: 1000,
      maxRetries: 1,
    });

    expect(usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(callLlm).toHaveBeenCalledTimes(1);
  });

  test("retries on failure and eventually succeeds", async () => {
    const callLlm = jest
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue({ inputTokens: 1, outputTokens: 1 });

    const usage = await callLlmWithRetry({
      callLlm,
      systemPrompt: "sys",
      userMessage: "hi",
      onChunk: () => {},
      onError: () => {},
      timeoutMs: 1000,
      maxRetries: 2,
    });

    expect(usage).toEqual({ inputTokens: 1, outputTokens: 1 });
    expect(callLlm).toHaveBeenCalledTimes(2);
  });

  test("throws after exhausting retries", async () => {
    const callLlm = jest.fn().mockRejectedValue(new Error("persistent"));

    await expect(
      callLlmWithRetry({
        callLlm,
        systemPrompt: "sys",
        userMessage: "hi",
        onChunk: () => {},
        onError: () => {},
        timeoutMs: 1000,
        maxRetries: 1,
      })
    ).rejects.toThrow("persistent");

    expect(callLlm).toHaveBeenCalledTimes(2);
  });

  test("throws on timeout", async () => {
    jest.useFakeTimers();
    const callLlm = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 5000);
        })
    );

    const promise = callLlmWithRetry({
      callLlm,
      systemPrompt: "sys",
      userMessage: "hi",
      onChunk: () => {},
      onError: () => {},
      timeoutMs: 50,
      maxRetries: 0,
    });

    jest.advanceTimersByTime(100);

    await expect(promise).rejects.toThrow("timed out");
    jest.useRealTimers();
  });
});
