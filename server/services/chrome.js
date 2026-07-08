"use strict";

/**
 * Chrome / Edge browser detection.
 * Searches common installation paths across macOS, Windows, and Linux.
 */

const path = require("path");
const fs = require("fs");

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    ...(() => {
      const pf = process.env.PROGRAMFILES || "C:\\Program Files";
      const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
      const local = process.env.LOCALAPPDATA || "";
      return [
        path.join(pf, "Google\\Chrome\\Application\\chrome.exe"),
        path.join(pf86, "Google\\Chrome\\Application\\chrome.exe"),
        path.join(local, "Google\\Chrome\\Application\\chrome.exe"),
      ];
    })(),
    ...(() => {
      const pf = process.env.PROGRAMFILES || "C:\\Program Files";
      const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
      return [
        path.join(pf, "Microsoft\\Edge\\Application\\msedge.exe"),
        path.join(pf86, "Microsoft\\Edge\\Application\\msedge.exe"),
      ];
    })(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      fs.accessSync(p);
      return p;
    } catch {
      // path not found on this platform — continue
    }
  }
  return null;
}

module.exports = { findChrome };
