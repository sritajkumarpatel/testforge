"use strict";

const fs = require("fs");
const path = require("path");

const AGENTS_DIR = path.join(__dirname, "agents");

const AGENT_FILES = {
  "requirements-analyst": "01-requirements-analyst.md",
  classifier: "00-classifier.md",
  "ui-agent": "02-ui-designer.md",
  "api-agent": "02-api-designer.md",
  "mock-agent": "02-mock-designer.md",
  "test-case-writer": "03-test-case-writer.md",
  "test-case-writer-bdd": "03-test-case-writer-bdd.md",
};

const AGENT_LABELS = {
  "requirements-analyst": "Requirements Analyst",
  classifier: "Requirement Type Classifier",
  "ui-agent": "UI Test Designer",
  "api-agent": "API Test Designer",
  "mock-agent": "Mock & Service Virtualization Designer",
  "test-case-writer": "Test Case Writer",
};

const CLASSIFIER_ORDER = ["ui-agent", "api-agent", "mock-agent"];

function loadAgentPrompt(agentId, mode = "regular") {
  let resolvedId = agentId;
  if (agentId === "test-case-writer" && mode === "bdd") {
    resolvedId = "test-case-writer-bdd";
  }
  const file = AGENT_FILES[resolvedId];
  if (!file) {
    throw new Error(`Unknown agent "${resolvedId}"`);
  }
  const fullPath = path.join(AGENTS_DIR, file);
  let content = "";
  try {
    content = fs.readFileSync(fullPath, "utf-8");
  } catch {
    content = `# ${AGENT_LABELS[agentId]}\n\n(Agent file not found)`;
  }
  return { id: agentId, name: AGENT_LABELS[agentId], file, prompt: content };
}

function loadAgentPrompts() {
  return Object.keys(AGENT_FILES).map((id) => loadAgentPrompt(id));
}

function generateRunId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const rand = Math.random().toString(36).slice(2, 8);
  return `tf-${ts}-${rand}`;
}

function formatDurationMs(start, end) {
  return `${(end - start).toFixed(0)}ms`;
}

function buildTokenNote(usage) {
  if (!usage) {
    return "token was not captured due to provider not returning usage metadata";
  }
  if (usage.unsupported) {
    return `token was not captured due to ${usage.reason || "provider not exposing usage metadata"}`;
  }
  return null;
}

async function callAgent({ send, agentId, userMessage, callLlm, previousOutputs = [], mode = "regular" }) {
  const agent = loadAgentPrompt(agentId, mode);

  send({ type: "agent-start", agent: agent.name, agentId });

  const systemPrompt = agent.prompt;
  const enrichedUserMessage = previousOutputs.length
    ? `${userMessage}\n\n---\n\nContext from previous agents:\n\n${previousOutputs.join("\n\n---\n\n")}`
    : userMessage;

  send({ type: "agent-stream-start", agent: agent.name, agentId });

  const startedAt = new Date().toISOString();
  let outputBuffer = "";
  let hasStreamed = false;
  let errorMessage = null;

  const usage = await callLlm({
    systemPrompt,
    userMessage: enrichedUserMessage,
    onChunk(text) {
      outputBuffer += text;
      hasStreamed = true;
      send({ type: "agent-chunk", agentId, text });
    },
    onError(msg) {
      errorMessage = msg;
      send({ type: "agent-error", agentId, message: msg });
    },
  });

  const endedAt = new Date().toISOString();

  if (!hasStreamed && !errorMessage) {
    send({ type: "agent-chunk", agentId, text: outputBuffer || "(no output)" });
  }

  const status = errorMessage ? "error" : "success";
  send({ type: "agent-done", agent: agent.name, agentId, status, output: outputBuffer });

  return {
    agentId,
    name: agent.name,
    status,
    startedAt,
    endedAt,
    output: outputBuffer,
    error: errorMessage,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    tokenNote: buildTokenNote(usage),
  };
}

function parseClassifierOutput(text) {
  const cleaned = text.trim();
  let plan;
  try {
    plan = JSON.parse(cleaned);
  } catch (err) {
    // Some models wrap JSON in markdown fences
    const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        plan = JSON.parse(match[1].trim());
      } catch (innerErr) {
        throw new Error(`Classifier returned invalid JSON: ${innerErr.message}`);
      }
    } else {
      throw new Error(`Classifier returned invalid JSON: ${err.message}`);
    }
  }

  const nextAgents = Array.isArray(plan.nextAgents) ? plan.nextAgents : [];
  const orderedAgents = CLASSIFIER_ORDER.filter((id) => nextAgents.includes(id));

  return {
    requirementTypes: Array.isArray(plan.requirementTypes) ? plan.requirementTypes : [],
    reasoning: plan.reasoning || "",
    nextAgents: orderedAgents,
    executionMode: plan.executionMode || "sequential",
  };
}

function buildAuditLog({ runId, input, classifierResult, agentRuns, finalOutput, startedAt, endedAt, metadata = {} }) {
  const totalInputTokens = agentRuns.reduce((sum, run) => sum + (run.inputTokens || 0), 0);
  const totalOutputTokens = agentRuns.reduce((sum, run) => sum + (run.outputTokens || 0), 0);
  const anyTokenMissing = agentRuns.some((run) => run.inputTokens === null || run.outputTokens === null);

  return {
    runId,
    timestamp: startedAt,
    completedAt: endedAt,
    metadata,
    input: {
      text: input,
      textLength: input.length,
    },
    classifier: {
      decision: classifierResult.requirementTypes,
      reasoning: classifierResult.reasoning,
      plan: classifierResult.nextAgents,
      output: classifierResult.output,
      status: classifierResult.status,
      error: classifierResult.error,
      inputTokens: classifierResult.inputTokens,
      outputTokens: classifierResult.outputTokens,
      tokenNote: classifierResult.tokenNote,
      startedAt: classifierResult.startedAt,
      endedAt: classifierResult.endedAt,
    },
    agents: agentRuns.map((run) => ({
      agentId: run.agentId,
      name: run.name,
      status: run.status,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      tokenNote: run.tokenNote,
      error: run.error,
    })),
    finalOutput,
    totals: {
      inputTokens: anyTokenMissing ? null : totalInputTokens,
      outputTokens: anyTokenMissing ? null : totalOutputTokens,
      tokenNote: anyTokenMissing
        ? "token was not captured due to at least one provider not exposing usage metadata"
        : null,
      durationMs: endedAt && startedAt ? new Date(endedAt) - new Date(startedAt) : null,
    },
  };
}

function exportLogAsTxt(log) {
  const lines = [];
  const meta = log.metadata || {};

  lines.push("=".repeat(80));
  lines.push("TestForge Run Summary");
  lines.push("=".repeat(80));

  lines.push(`Requirement ID:   ${meta.requirementId || "N/A"}`);
  lines.push(`Ticket Title:     ${meta.ticketTitle || "N/A"}`);
  lines.push(`Ticket Number:    ${meta.ticketNumber || "N/A"}`);
  lines.push("");

  lines.push(`LLM Provider:     ${meta.provider || "N/A"}`);
  lines.push(`LLM Model:        ${meta.model || "N/A"}`);
  lines.push(`Output Mode:      ${meta.mode || "regular"}`);
  lines.push("");

  lines.push("-".repeat(80));
  lines.push("TOKENS");
  lines.push("-".repeat(80));
  const inputTokens = log.totals.inputTokens != null ? String(log.totals.inputTokens) : log.totals.tokenNote;
  const outputTokens = log.totals.outputTokens != null ? String(log.totals.outputTokens) : log.totals.tokenNote;
  lines.push(`Total tokens in:  ${inputTokens}`);
  lines.push(`Total tokens out: ${outputTokens}`);
  lines.push("");

  lines.push("-".repeat(80));
  lines.push("AGENTS EXECUTED");
  lines.push("-".repeat(80));
  for (const agent of log.agents) {
    const tokensIn = agent.inputTokens != null ? String(agent.inputTokens) : agent.tokenNote;
    const tokensOut = agent.outputTokens != null ? String(agent.outputTokens) : agent.tokenNote;
    lines.push(`- ${agent.name}: ${agent.status} | in: ${tokensIn} | out: ${tokensOut}`);
  }
  lines.push("");

  lines.push("-".repeat(80));
  lines.push("CLASSIFIER DECISION");
  lines.push("-".repeat(80));
  lines.push(`Detected types: ${log.classifier.decision.join(", ") || "none"}`);
  lines.push(`Reasoning:      ${log.classifier.reasoning || "N/A"}`);
  lines.push("=".repeat(80));

  return lines.join("\n");
}

async function runOrchestratedPipeline({ send, userInput, callLlm, mode = "regular", metadata = {} }) {
  const runId = generateRunId();
  const startedAt = new Date().toISOString();

  send({ type: "pipeline-start", runId, mode, message: "Starting orchestrated pipeline." });

  const agentRuns = [];

  // Step 1: Requirements Analyst
  const analystRun = await callAgent({
    send,
    agentId: "requirements-analyst",
    userMessage: `Analyze the following input and produce the structured requirements summary:\n\n${userInput}`,
    callLlm,
    mode,
  });
  agentRuns.push(analystRun);

  if (analystRun.status === "error") {
    const log = buildAuditLog({
      runId,
      input: userInput,
      classifierResult: { status: "skipped", output: "", reasoning: "", nextAgents: [], requirementTypes: [] },
      agentRuns,
      finalOutput: "",
      startedAt,
      endedAt: new Date().toISOString(),
      metadata,
    });
    send({ type: "pipeline-error", message: analystRun.error, log });
    send({ type: "pipeline-done", output: "", log });
    return log;
  }

  // Step 2: Classifier
  const classifierRun = await callAgent({
    send,
    agentId: "classifier",
    userMessage: `Classify the following structured requirements summary and return ONLY the JSON plan:\n\n${analystRun.output}`,
    callLlm,
    mode,
  });
  agentRuns.push(classifierRun);

  let plan;
  let classifierResult;

  if (classifierRun.status === "error") {
    classifierResult = {
      status: "error",
      output: classifierRun.output,
      reasoning: classifierRun.error,
      nextAgents: [],
      requirementTypes: [],
      inputTokens: classifierRun.inputTokens,
      outputTokens: classifierRun.outputTokens,
      tokenNote: classifierRun.tokenNote,
      startedAt: classifierRun.startedAt,
      endedAt: classifierRun.endedAt,
      error: classifierRun.error,
    };
  } else {
    try {
      plan = parseClassifierOutput(classifierRun.output);
      classifierResult = {
        status: "success",
        output: classifierRun.output,
        reasoning: plan.reasoning,
        nextAgents: plan.nextAgents,
        requirementTypes: plan.requirementTypes,
        inputTokens: classifierRun.inputTokens,
        outputTokens: classifierRun.outputTokens,
        tokenNote: classifierRun.tokenNote,
        startedAt: classifierRun.startedAt,
        endedAt: classifierRun.endedAt,
        error: null,
      };
    } catch (err) {
      classifierResult = {
        status: "error",
        output: classifierRun.output,
        reasoning: "",
        nextAgents: [],
        requirementTypes: [],
        inputTokens: classifierRun.inputTokens,
        outputTokens: classifierRun.outputTokens,
        tokenNote: classifierRun.tokenNote,
        startedAt: classifierRun.startedAt,
        endedAt: classifierRun.endedAt,
        error: err.message,
      };
    }
  }

  send({
    type: "classifier-decision",
    decision: classifierResult.requirementTypes,
    reasoning: classifierResult.reasoning,
    plannedAgents: classifierResult.nextAgents,
    status: classifierResult.status,
  });

  if (classifierResult.status === "error" || classifierResult.nextAgents.length === 0) {
    const log = buildAuditLog({
      runId,
      input: userInput,
      classifierResult,
      agentRuns,
      finalOutput: "",
      startedAt,
      endedAt: new Date().toISOString(),
      metadata,
    });
    const message = classifierResult.error || "No specialist agents planned by classifier.";
    send({ type: "pipeline-error", message, log });
    send({ type: "pipeline-done", output: "", log });
    return log;
  }

  // Step 3: Specialist agents (sequential)
  const specialistOutputs = [];
  for (const agentId of classifierResult.nextAgents) {
    const run = await callAgent({
      send,
      agentId,
      userMessage: `Based on the following structured requirements, produce ${AGENT_LABELS[agentId].toLowerCase()} scenarios:\n\n${analystRun.output}`,
      callLlm,
      previousOutputs: specialistOutputs,
      mode,
    });
    agentRuns.push(run);
    specialistOutputs.push(run.output);

    if (run.status === "error") {
      const log = buildAuditLog({
        runId,
        input: userInput,
        classifierResult,
        agentRuns,
        finalOutput: "",
        startedAt,
        endedAt: new Date().toISOString(),
        metadata,
      });
      send({ type: "pipeline-error", message: run.error, log });
      send({ type: "pipeline-done", output: "", log });
      return log;
    }
  }

  // Step 4: Test Case Writer
  const aggregateContext = specialistOutputs.join("\n\n=== END OF SPECIALIST OUTPUT ===\n\n");
  const writerRun = await callAgent({
    send,
    agentId: "test-case-writer",
    userMessage: `Convert the following specialist test scenarios into a single ADO-ready JSON array of test cases.\n\n${aggregateContext}`,
    callLlm,
    mode,
  });
  agentRuns.push(writerRun);

  const endedAt = new Date().toISOString();
  const finalOutput = writerRun.status === "success" ? writerRun.output : "";

  const log = buildAuditLog({
    runId,
    input: userInput,
    classifierResult,
    agentRuns,
    finalOutput,
    startedAt,
    endedAt,
    metadata,
  });

  if (writerRun.status === "error") {
    send({ type: "pipeline-error", message: writerRun.error, log });
  }

  send({ type: "pipeline-done", output: finalOutput, log });
  return log;
}

module.exports = {
  loadAgentPrompt,
  loadAgentPrompts,
  runOrchestratedPipeline,
  buildAuditLog,
  exportLogAsTxt,
  parseClassifierOutput,
};
