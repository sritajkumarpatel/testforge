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

function buildTestCasePayload(title, steps, tags, extra = null) {
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

  // Construct description html for extra context
  let descriptionHtml = "";
  if (extra) {
    const sections = [];

    // Environment
    if (extra.environment) {
      sections.push(`<p><strong>Environment:</strong> ${escXml(extra.environment)}</p>`);
    }

    // Traceability
    if (extra.traceability) {
      const trace = [];
      if (extra.traceability.requirementId) {
        trace.push(`Requirement ID: ${escXml(extra.traceability.requirementId)}`);
      }
      if (extra.traceability.workItemId) {
        trace.push(`Work Item ID: ${escXml(extra.traceability.workItemId)}`);
      }
      if (extra.traceability.ticketTitle) {
        trace.push(`Ticket Title: ${escXml(extra.traceability.ticketTitle)}`);
      }
      if (trace.length) {
        sections.push(`<p><strong>Traceability:</strong><br/>` + trace.join("<br/>") + `</p>`);
      }
    }

    // Prerequisites
    if (Array.isArray(extra.prerequisites) && extra.prerequisites.length) {
      const list = extra.prerequisites.map((p) => `<li>${escXml(p)}</li>`).join("");
      sections.push(`<p><strong>Prerequisites:</strong></p><ul>${list}</ul>`);
    }

    // Assumptions
    if (Array.isArray(extra.assumptions) && extra.assumptions.length) {
      const list = extra.assumptions.map((a) => `<li>${escXml(a)}</li>`).join("");
      sections.push(`<p><strong>Assumptions:</strong></p><ul>${list}</ul>`);
    }

    // Test Data
    if (
      extra.testData &&
      typeof extra.testData === "object" &&
      Object.keys(extra.testData).length
    ) {
      const list = Object.entries(extra.testData)
        .map(
          ([k, v]) =>
            `<li><strong>${escXml(k)}</strong>: ${escXml(typeof v === "object" ? JSON.stringify(v) : String(v))}</li>`
        )
        .join("");
      sections.push(`<p><strong>Test Data:</strong></p><ul>${list}</ul>`);
    }

    // Cleanup
    if (Array.isArray(extra.cleanup) && extra.cleanup.length) {
      const list = extra.cleanup.map((c) => `<li>${escXml(c)}</li>`).join("");
      sections.push(`<p><strong>Cleanup / Teardown:</strong></p><ul>${list}</ul>`);
    }

    // BDD Examples Table
    if (
      extra.examples &&
      Array.isArray(extra.examples.headers) &&
      Array.isArray(extra.examples.rows) &&
      extra.examples.rows.length
    ) {
      const headers = extra.examples.headers.map((h) => `<th>${escXml(h)}</th>`).join("");
      const rows = extra.examples.rows
        .map((r) => `<tr>${r.map((val) => `<td>${escXml(String(val))}</td>`).join("")}</tr>`)
        .join("");
      sections.push(
        `<p><strong>BDD Examples Outline:</strong></p><table border="1" cellpadding="5" cellspacing="0"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`
      );
    }

    if (sections.length) {
      descriptionHtml = sections.join("");
    }

    // Map priority (e.g. P0 -> 1, P2 -> 2)
    if (extra.priority) {
      const priMatch = String(extra.priority).match(/\d+/);
      if (priMatch) {
        const val = parseInt(priMatch[0], 10);
        const adoPriority = val === 0 ? 1 : val;
        ops.push({
          op: "add",
          path: "/fields/Microsoft.VSTS.Common.Priority",
          value: adoPriority,
        });
      }
    }
  }

  if (descriptionHtml) {
    ops.push({
      op: "add",
      path: "/fields/System.Description",
      value: descriptionHtml,
    });
  }

  return ops;
}

module.exports = { escXml, buildTestCasePayload };
