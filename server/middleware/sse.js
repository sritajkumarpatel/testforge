"use strict";

/**
 * SSE (Server-Sent Events) helpers.
 * Used by all streaming endpoints (agent pipeline, ADO creation).
 */

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

module.exports = { initSseResponse, sseSend };
