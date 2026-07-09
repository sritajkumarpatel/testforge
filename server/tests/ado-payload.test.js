"use strict";

const { buildTestCasePayload } = require("../services/ado-payload");

describe("buildTestCasePayload", () => {
  const mockSteps = [
    { action: "Navigate to home page", expected: "Home page loaded" },
    { action: "Click login button", expected: "Login modal is visible" },
  ];
  const mockTags = ["UI", "Login", "P1"];

  test("builds basic payload with title, steps and tags", () => {
    const payload = buildTestCasePayload("Login flow", mockSteps, mockTags);

    expect(payload).toContainEqual({
      op: "add",
      path: "/fields/System.Title",
      value: "Login flow",
    });

    expect(payload).toContainEqual({
      op: "add",
      path: "/fields/System.Tags",
      value: "UI; Login; P1",
    });

    const stepsOp = payload.find((op) => op.path === "/fields/Microsoft.VSTS.TCM.Steps");
    expect(stepsOp).toBeDefined();
    expect(stepsOp.value).toContain('step id="1"');
    expect(stepsOp.value).toContain('step id="2"');
  });

  test("builds payload with extra parameters (environment, assumptions, prerequisites)", () => {
    const extra = {
      priority: "P0",
      environment: "Staging - Chrome",
      prerequisites: ["User exists"],
      assumptions: ["No CAPTCHA"],
      testData: { username: "test01" },
      cleanup: ["Logout"],
    };

    const payload = buildTestCasePayload("Enhanced case", mockSteps, mockTags, extra);

    // Verify priority mapping (P0 -> 1)
    expect(payload).toContainEqual({
      op: "add",
      path: "/fields/Microsoft.VSTS.Common.Priority",
      value: 1,
    });

    // Verify description HTML formatting
    const descOp = payload.find((op) => op.path === "/fields/System.Description");
    expect(descOp).toBeDefined();
    expect(descOp.value).toContain("<strong>Environment:</strong> Staging - Chrome");
    expect(descOp.value).toContain("<strong>Prerequisites:</strong>");
    expect(descOp.value).toContain("<li>User exists</li>");
    expect(descOp.value).toContain("<strong>Assumptions:</strong>");
    expect(descOp.value).toContain("<li>No CAPTCHA</li>");
    expect(descOp.value).toContain("<strong>Test Data:</strong>");
    expect(descOp.value).toContain("<strong>username</strong>: test01");
    expect(descOp.value).toContain("<strong>Cleanup / Teardown:</strong>");
    expect(descOp.value).toContain("<li>Logout</li>");
  });

  test("supports BDD examples table generation", () => {
    const extra = {
      examples: {
        headers: ["username", "role"],
        rows: [
          ["user01", "Admin"],
          ["user02", "Guest"],
        ],
      },
    };

    const payload = buildTestCasePayload("BDD Outline", mockSteps, mockTags, extra);
    const descOp = payload.find((op) => op.path === "/fields/System.Description");
    expect(descOp).toBeDefined();
    expect(descOp.value).toContain("<th>username</th>");
    expect(descOp.value).toContain("<th>role</th>");
    expect(descOp.value).toContain("<td>user01</td>");
    expect(descOp.value).toContain("<td>Admin</td>");
  });
});
