"use strict";

/**
 * @file LLM call wrapper with timeout and exponential backoff retry.
 */

const logger = require("./logger");
const config = require("./config");
require("./types");

/** @type {number} */
const DEFAULT_TIMEOUT_MS = config.agentTimeoutMs;
/** @type {number} */
const DEFAULT_MAX_RETRIES = config.agentMaxRetries;

/**
 * Wait for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Race a promise against a timeout.
 * @param {Promise<any>} promise
 * @param {number} ms
 * @returns {Promise<any>}
 */
function callWithTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`LLM call timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Call an LLM with timeout and retry semantics.
 * @param {Object} params
 * @param {Function} params.callLlm
 * @param {string} params.systemPrompt
 * @param {string} params.userMessage
 * @param {Function} params.onChunk
 * @param {Function} params.onError
 * @param {number} [params.timeoutMs]
 * @param {number} [params.maxRetries]
 * @returns {Promise<ProviderUsage>}
 */
async function callLlmWithRetry({
  callLlm,
  systemPrompt,
  userMessage,
  onChunk,
  onError,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
}) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        { attempt: attempt + 1, maxRetries: maxRetries + 1, timeoutMs },
        "LLM call start"
      );
      const usage = await callWithTimeout(
        callLlm({ systemPrompt, userMessage, onChunk, onError }),
        timeoutMs
      );
      logger.info({ attempt: attempt + 1 }, "LLM call success");
      return usage;
    } catch (err) {
      lastError = err;
      logger.warn(
        { attempt: attempt + 1, maxRetries: maxRetries + 1, error: err.message },
        "LLM call failed"
      );
      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * 2 ** attempt, 10000);
        logger.info({ backoffMs }, "Retrying LLM call");
        await delay(backoffMs);
      }
    }
  }

  throw lastError || new Error("LLM call failed after retries");
}

module.exports = { callLlmWithRetry, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RETRIES };
