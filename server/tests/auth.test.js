"use strict";

const request = require("supertest");

describe("AUTH_TOKEN protection", () => {
  const originalToken = process.env.AUTH_TOKEN;

  beforeEach(() => {
    jest.resetModules();
    process.env.AUTH_TOKEN = "test-secret-token";
  });

  afterEach(() => {
    process.env.AUTH_TOKEN = originalToken;
  });

  test("rejects /api/config without token", async () => {
    const { app } = require("../server");
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(401);
  });

  test("allows /api/config with valid bearer token", async () => {
    const { app } = require("../server");
    const res = await request(app)
      .get("/api/config")
      .set("Authorization", "Bearer test-secret-token");
    expect(res.status).toBe(200);
    expect(res.body.providers).toBeInstanceOf(Array);
  });

  test("/health remains public", async () => {
    const { app } = require("../server");
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});
