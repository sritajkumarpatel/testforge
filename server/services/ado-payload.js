"use strict";

/**
 * ADO test case payload builder.
 * Converts test case objects into Azure DevOps work item PATCH payloads.
 */

function escXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildTestCasePayload(title, steps, tags) {
  const stepElements = steps
    .map((s, i) => {
      const fmt = (text) =>
        escXml(text).replace(/\n\n/g, "&lt;/P&gt;&lt;P&gt;").replace(/\n/g, "&lt;BR/&gt;");
      const action = fmt(s.action);
      const expected = fmt(s.expected);
      return (
        `<step id="${i + 1}" type="ValidateStep">` +
        `<parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;${action}&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>` +
        `<parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;${expected}&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>` +
        `<description/>` +
        `</step>`
      );
    })
    .join("");

  const stepsXml = `<steps id="0" last="${steps.length}">` + stepElements + `</steps>`;

  const ops = [
    { op: "add", path: "/fields/System.Title", value: title },
    { op: "add", path: "/fields/Microsoft.VSTS.TCM.Steps", value: stepsXml },
  ];

  if (tags && tags.length) {
    ops.push({
      op: "add",
      path: "/fields/System.Tags",
      value: tags.join("; "),
    });
  }

  return ops;
}

module.exports = { escXml, buildTestCasePayload };
