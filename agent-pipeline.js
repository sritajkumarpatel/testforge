"use strict";

const fs = require("fs");
const path = require("path");

const AGENTS_DIR = path.join(__dirname, "agents");

const AGENT_FILES = [
  "01-requirements-analyst.md",
  "02-test-designer.md",
  "03-test-case-writer.md",
];

const AGENT_LABELS = [
  "Requirements Analyst",
  "Test Designer",
  "Test Case Writer",
];

function loadAgentPrompts() {
  const agents = AGENT_FILES.map((file, i) => {
    const fullPath = path.join(AGENTS_DIR, file);
    let content = "";
    try {
      content = fs.readFileSync(fullPath, "utf-8");
    } catch {
      content = `# ${AGENT_LABELS[i]}\n\n(Agent file not found)`;
    }
    return { id: i, name: AGENT_LABELS[i], file, prompt: content };
  });
  return agents;
}

// Run the full 3-agent pipeline, streaming events via `send`.
// Each agent call is a separate LLM generate call.
// The output of agent N is appended to the input of agent N+1.
async function runAgentPipeline({ send, userInput, callLlm }) {
  const agents = loadAgentPrompts();

  let previousOutput = "";

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];

    send({ type: "agent-start", agent: agent.name, agentIndex: i });

    // Build the message for this agent
    let systemPrompt = agent.prompt;

    // For agent 2 and 3, prepend previous agent's output as context
    let userMessage;
    if (i === 0) {
      // Requirements Analyst: gets the raw user input
      userMessage = `Analyze the following input and produce the structured requirements summary:\n\n${userInput}`;
    } else if (i === 1) {
      // Test Designer: gets the requirements summary from Agent 1
      userMessage = `Based on the following requirements, design test scenarios:\n\n${previousOutput}`;
    } else {
      // Test Case Writer: gets the scenarios from Agent 2
      userMessage = `Convert these test scenarios to ADO JSON test cases:\n\n${previousOutput}`;
    }

    send({ type: "agent-stream-start", agent: agent.name, agentIndex: i });

    let outputBuffer = "";
    let hasStreamed = false;

    await callLlm({
      systemPrompt,
      userMessage,
      onChunk(text) {
        outputBuffer += text;
        hasStreamed = true;
        send({ type: "agent-chunk", agentIndex: i, text });
      },
      onDone() {
        if (!hasStreamed) {
          // If no streaming content was received (e.g. cached response),
          // send whatever we have
          send({ type: "agent-chunk", agentIndex: i, text: outputBuffer || "(no output)" });
        }
        send({ type: "agent-done", agent: agent.name, agentIndex: i, output: outputBuffer });
      },
      onError(msg) {
        send({ type: "agent-error", agentIndex: i, message: msg });
      },
    });

    previousOutput = outputBuffer;
  }

  send({ type: "pipeline-done", output: previousOutput });
}

module.exports = { loadAgentPrompts, runAgentPipeline };
