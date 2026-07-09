"use strict";

const request = require("supertest");
const { app } = require("../server");

describe("Server routes", () => {
  test("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeTruthy();
  });

  test("GET /api/config returns providers without secret values", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);
    expect(res.body.providers).toBeInstanceOf(Array);
    expect(res.body.providers.length).toBeGreaterThan(0);

    for (const provider of res.body.providers) {
      for (const field of provider.configFields) {
        if (field.key === "apiKey") {
          expect(field.envValue).toBe("");
        }
      }
    }

    const envJson = JSON.stringify(res.body.env);
    expect(envJson).not.toContain("OPENAI_API_KEY");
    expect(envJson).not.toContain("CLAUDE_API_KEY");
    expect(envJson).not.toContain("GOOGLE_API_KEY");
    expect(envJson).not.toContain("OPENCODE_API_KEY");
  });

  test("GET /api/agents returns orchestrated agents", async () => {
    const res = await request(app).get("/api/agents");
    expect(res.status).toBe(200);
    const ids = res.body.agents.map((a) => a.id);
    expect(ids).toContain("requirements-analyst");
    expect(ids).toContain("classifier");
    expect(ids).toContain("ui-agent");
    expect(ids).toContain("api-agent");
    expect(ids).toContain("test-case-writer");
  });

  test("POST /api/agents/run rejects missing input", async () => {
    const res = await request(app).post("/api/agents/run").send({ input: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error.toLowerCase()).toContain("input");
  });

  test("POST /api/agents/run rejects unknown provider", async () => {
    const res = await request(app)
      .post("/api/agents/run")
      .send({ input: "test", provider: "unknown-provider" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
  });

  test("POST /api/ado/run-pat rejects missing ADO_PAT", async () => {
    const res = await request(app)
      .post("/api/ado/run-pat")
      .send({
        scenarios: [{ title: "T", steps: [{ action: "A", expected: "E" }] }],
        config: { org: "myorg", project: "myproject" },
      });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("ADO_PAT");
  });

  test("GET /ready returns ready when logs directory is writable", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });

  test("GET /api/agents/run/:runId/status returns 404 for unknown run", async () => {
    const res = await request(app).get("/api/agents/run/tf-unknown/status");
    expect(res.status).toBe(404);
  });
});
