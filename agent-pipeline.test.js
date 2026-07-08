"use strict";

const {
  runOrchestratedPipeline,
  parseClassifierOutput,
  exportLogAsTxt,
  loadAgentPrompts,
} = require("./agent-pipeline");

function createMockLlm(overrides = {}) {
  return async ({ systemPrompt, onChunk }) => {
    let output = "";

    if (systemPrompt.includes("# Requirement Type Classifier")) {
      output =
        overrides.classifierOutput ??
        '{"requirementTypes":["ui"],"reasoning":"UI only","nextAgents":["ui-agent"],"executionMode":"sequential"}';
    } else if (systemPrompt.includes("# Requirements Analyst")) {
      output =
        overrides.analystOutput ??
        "## Requirements Summary\n\n### Actors\n- User\n\n### Feature Areas\n\n#### Login\n**Description**: Login form\n**Priority**: High\n**Acceptance Criteria**:\n- User can log in\n";
    } else if (systemPrompt.includes("# UI Test Designer")) {
      output =
        overrides.uiOutput ??
        "## UI Test Scenarios\n- [P0] Valid login\n  - **Precondition**: on login page\n  - **Input / Action**: enter credentials\n  - **Expected**: dashboard shown\n";
    } else if (systemPrompt.includes("# API Test Designer")) {
      output =
        overrides.apiOutput ??
        "## API Test Scenarios\n- [P0] POST /login returns token\n  - **Endpoint**: POST /login\n  - **Expected**: 200 + token\n";
    } else if (systemPrompt.includes("# BDD Test Case Writer")) {
      output =
        overrides.bddWriterOutput ??
        '[{"title":"Login — Valid credentials","tags":["UI","Login","P0"],"steps":[{"action":"Given the user is on the login page","expected":""},{"action":"When the user enters valid credentials","expected":""},{"action":"Then the dashboard is displayed","expected":""}]}]';
    } else if (systemPrompt.includes("# Test Case Writer")) {
      output =
        overrides.writerOutput ??
        '[{"title":"Login — Valid credentials","tags":["UI","Login","P0"],"steps":[{"action":"Navigate to login page","expected":"Login page loads"},{"action":"Enter valid credentials","expected":"Credentials accepted"},{"action":"Click Login","expected":"Dashboard shown"},{"action":"Verify welcome message","expected":"Welcome message displayed"}]}]';
    }

    for (let i = 0; i < output.length; i += 10) {
      onChunk(output.slice(i, i + 10));
    }
    return { unsupported: true, reason: "mock provider used for testing" };
  };
}

function createSend() {
  const events = [];
  const send = (ev) => events.push(ev);
  send.events = events;
  return send;
}

describe("runOrchestratedPipeline", () => {
  test("runs UI-only requirement in regular mode", async () => {
    const send = createSend();
    const log = await runOrchestratedPipeline({
      send,
      userInput: "User logs in via a web form.",
      callLlm: createMockLlm(),
      mode: "regular",
      metadata: { provider: "mock", model: "mock-model" },
    });

    const agentNames = log.agents.map((a) => a.agentId);
    expect(agentNames).toEqual([
      "requirements-analyst",
      "classifier",
      "ui-agent",
      "test-case-writer",
    ]);
    expect(log.classifier.decision).toEqual(["ui"]);
    expect(log.metadata.provider).toBe("mock");
    expect(log.finalOutput).toContain("Login — Valid credentials");
    expect(JSON.parse(log.finalOutput)).toBeInstanceOf(Array);
  });

  test("runs mixed UI+API requirement in regular mode", async () => {
    const send = createSend();
    const log = await runOrchestratedPipeline({
      send,
      userInput: "User logs in via form and API returns token.",
      callLlm: createMockLlm({
        classifierOutput:
          '{"requirementTypes":["ui","api"],"reasoning":"Mixed","nextAgents":["ui-agent","api-agent"],"executionMode":"sequential"}',
      }),
      mode: "regular",
      metadata: { provider: "mock", model: "mock-model" },
    });

    const agentNames = log.agents.map((a) => a.agentId);
    expect(agentNames).toEqual([
      "requirements-analyst",
      "classifier",
      "ui-agent",
      "api-agent",
      "test-case-writer",
    ]);
    expect(log.classifier.decision).toEqual(["ui", "api"]);
  });

  test("runs BDD mode when selected", async () => {
    const send = createSend();
    const log = await runOrchestratedPipeline({
      send,
      userInput: "User logs in via a web form.",
      callLlm: createMockLlm(),
      mode: "bdd",
      metadata: { provider: "mock", model: "mock-model" },
    });

    expect(log.metadata.mode).toBe("bdd");
    expect(log.finalOutput).toContain("Given the user is on the login page");
  });

  test("emits pipeline-error when analyst fails", async () => {
    const send = createSend();
    const failingLlm = async ({ onError }) => {
      onError("LLM unreachable");
      return { unsupported: true, reason: "mock failure" };
    };

    const log = await runOrchestratedPipeline({
      send,
      userInput: "User logs in.",
      callLlm: failingLlm,
      mode: "regular",
      metadata: {},
    });

    expect(log.agents[0].status).toBe("error");
    expect(log.agents[0].error).toBe("LLM unreachable");
    expect(send.events.some((e) => e.type === "pipeline-error")).toBe(true);
  });

  test("emits pipeline-error when classifier returns invalid JSON", async () => {
    const send = createSend();
    const log = await runOrchestratedPipeline({
      send,
      userInput: "User logs in.",
      callLlm: createMockLlm({
        classifierOutput: "this is not json",
      }),
      mode: "regular",
      metadata: {},
    });

    expect(log.classifier.status).toBe("error");
    expect(send.events.some((e) => e.type === "pipeline-error")).toBe(true);
  });
});

describe("parseClassifierOutput", () => {
  test("parses plain JSON", () => {
    const plan = parseClassifierOutput(
      '{"requirementTypes":["api"],"reasoning":"API only","nextAgents":["api-agent"],"executionMode":"sequential"}'
    );
    expect(plan.requirementTypes).toEqual(["api"]);
    expect(plan.nextAgents).toEqual(["api-agent"]);
  });

  test("parses JSON inside markdown fences", () => {
    const plan = parseClassifierOutput(
      '```json\n{"requirementTypes":["mock"],"reasoning":"Mock","nextAgents":["mock-agent"]}\n```'
    );
    expect(plan.requirementTypes).toEqual(["mock"]);
    expect(plan.nextAgents).toEqual(["mock-agent"]);
  });

  test("orders agents consistently", () => {
    const plan = parseClassifierOutput(
      '{"requirementTypes":["api","ui","mock"],"reasoning":"All","nextAgents":["mock-agent","api-agent","ui-agent"]}'
    );
    expect(plan.nextAgents).toEqual(["ui-agent", "api-agent", "mock-agent"]);
  });

  test("throws on invalid JSON", () => {
    expect(() => parseClassifierOutput("not json")).toThrow();
  });
});

describe("exportLogAsTxt", () => {
  test("includes metadata and totals", () => {
    const log = {
      runId: "tf-test",
      timestamp: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:05.000Z",
      metadata: {
        requirementId: "REQ-1",
        ticketTitle: "Login",
        ticketNumber: "42",
        provider: "OpenAI",
        model: "gpt-4o",
        mode: "regular",
      },
      classifier: {
        decision: ["ui"],
        reasoning: "UI only",
        status: "success",
      },
      agents: [
        {
          name: "Requirements Analyst",
          agentId: "requirements-analyst",
          status: "success",
          inputTokens: 100,
          outputTokens: 50,
          tokenNote: null,
        },
      ],
      totals: {
        inputTokens: 100,
        outputTokens: 50,
        tokenNote: null,
        durationMs: 5000,
      },
    };

    const txt = exportLogAsTxt(log);
    expect(txt).toContain("Requirement ID:   REQ-1");
    expect(txt).toContain("Ticket Title:     Login");
    expect(txt).toContain("Ticket Number:    42");
    expect(txt).toContain("LLM Provider:     OpenAI");
    expect(txt).toContain("LLM Model:        gpt-4o");
    expect(txt).toContain("Total tokens in:  100");
    expect(txt).toContain("Total tokens out: 50");
  });

  test("shows token note when usage unavailable", () => {
    const log = {
      runId: "tf-test",
      metadata: {},
      classifier: { decision: [], reasoning: "", status: "success" },
      agents: [],
      totals: {
        inputTokens: null,
        outputTokens: null,
        tokenNote: "token was not captured due to provider not returning usage metadata",
      },
    };

    const txt = exportLogAsTxt(log);
    expect(txt).toContain(
      "Total tokens in:  token was not captured due to provider not returning usage metadata"
    );
  });
});

describe("loadAgentPrompts", () => {
  test("loads all expected agents", () => {
    const agents = loadAgentPrompts();
    const ids = agents.map((a) => a.id);
    expect(ids).toEqual([
      "requirements-analyst",
      "classifier",
      "ui-agent",
      "api-agent",
      "mock-agent",
      "test-case-writer",
      "test-case-writer-bdd",
    ]);
  });
});
