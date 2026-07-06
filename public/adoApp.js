const AdoApp = (() => {
  function escHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  let _parsedScenarios = [];
  let _isRunning = false;
  let _resultRows = [];
  let _plannerStreaming = false;
  let _generateStreaming = false;
  let _convertStreaming = false;
  let _attachedFileContent = "";
  let _attachedFileName = "";

  let _providers = [];
  let _currentProvider = { id: "ollama" };

  const $ = (id) => document.getElementById(id);

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    _setPipelineStage("plan");
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (cfg.org) { const el = $("adoOrg"); if (el) el.value = cfg.org; }
        if (cfg.project) { const el = $("adoProject"); if (el) el.value = cfg.project; }
        if (cfg.chromePath) { const el = $("adoChromePath"); if (el) el.value = cfg.chromePath; }
        if (cfg.providers) {
          _providers = cfg.providers;
          _populateProviderSelect();
          _currentProvider = _providers[0] || { id: "ollama", name: "Ollama", configFields: [] };
          _renderProviderConfig();
          _updateProviderLabels();
        }
      })
      .catch(() => console.warn("Failed to load config"));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  function switchAppTab(tab) {
    document.querySelectorAll(".app-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".app-tab-panel").forEach((p) => p.classList.add("hidden"));
    const btn = document.querySelector(`.app-tab[data-tab="${tab}"]`);
    if (btn) btn.classList.add("active");
    const panel = $(`appTab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`);
    if (panel) panel.classList.remove("hidden");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SETTINGS — LLM PROVIDER
  // ══════════════════════════════════════════════════════════════════════════

  function _getProviderConfig() {
    const select = $("adoLlmProvider");
    const providerId = select ? select.value : _currentProvider.id;
    const provider = _providers.find((p) => p.id === providerId) || _currentProvider;
    const config = {};
    if (provider.configFields) {
      provider.configFields.forEach((field) => {
        const el = $(`provider_${field.key}`);
        if (el) {
          let val = el.value;
          if (field.type === "password" && val === "••••••") val = "";
          config[field.key] = val;
        }
      });
    }
    return { id: providerId, config };
  }

  function _populateProviderSelect() {
    const sel = $("adoLlmProvider");
    if (!sel) return;
    sel.innerHTML = _providers.map((p) => `<option value="${p.id}">${escHtml(p.name)}</option>`).join("");
  }

  function _renderProviderConfig() {
    const container = $("adoLlmConfigFields");
    if (!container) return;
    const sel = $("adoLlmProvider");
    const providerId = sel ? sel.value : "ollama";
    const provider = _providers.find((p) => p.id === providerId);
    if (!provider || !provider.configFields) { container.innerHTML = ""; return; }
    container.innerHTML = provider.configFields.map((field) => {
      const id = `provider_${field.key}`;
      if (field.type === "select") {
        const opts = (field.options || []).map((o) => `<option value="${o}"${o === field.defaultValue ? " selected" : ""}>${o}</option>`).join("");
        return `<div class="provider-config-field"><label for="${id}">${escHtml(field.label)}</label><select id="${id}" class="input">${opts}</select></div>`;
      }
      const type = field.type === "password" ? "password" : "text";
      const val = field.defaultValue ? ` value="${escHtml(field.defaultValue)}"` : "";
      const placeholder = field.placeholder ? ` placeholder="${escHtml(field.placeholder)}"` : "";
      return `<div class="provider-config-field"><label for="${id}">${escHtml(field.label)}</label><input id="${id}" type="${type}" class="input"${val}${placeholder} /></div>`;
    }).join("");
  }

  function onProviderChange() {
    _renderProviderConfig();
    _updateProviderLabels();
    const statusEl = $("adoLlmTestStatus");
    if (statusEl) { statusEl.textContent = ""; statusEl.className = "ado-parse-status"; }
  }

  function _updateProviderLabels() {
    const provider = _getProviderConfig();
    const name = _providers.find((p) => p.id === provider.id)?.name || provider.id;
    const els = [$("planProviderLabel"), $("convertProviderLabel")];
    els.forEach((el) => { if (el) el.textContent = name; });
  }

  async function testProviderConnection() {
    const { id, config } = _getProviderConfig();
    const statusEl = $("adoLlmTestStatus");
    if (!statusEl) return;
    statusEl.textContent = "Testing…";
    statusEl.className = "ado-parse-status";
    try {
      const res = await fetch("/api/llm/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: id,
          config,
          systemPrompt: "You are a helpful assistant. Reply with exactly: OK",
          userMessage: "Say OK",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        statusEl.textContent = `✗ ${data.error || res.status}`;
        statusEl.className = "ado-parse-status err";
        return;
      }
      let received = false;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === "chunk") received = true;
            if (ev.type === "done") {
              statusEl.textContent = received ? "✓ Connected successfully" : "✓ Connected (no content)";
              statusEl.className = "ado-parse-status ok";
              return;
            }
            if (ev.type === "error") {
              statusEl.textContent = `✗ ${ev.message}`;
              statusEl.className = "ado-parse-status err";
              return;
            }
          } catch {}
        }
      }
      statusEl.textContent = received ? "✓ Connected" : "⚠ No response";
      statusEl.className = received ? "ado-parse-status ok" : "ado-parse-status";
    } catch (err) {
      statusEl.textContent = `✗ ${err.message}`;
      statusEl.className = "ado-parse-status err";
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SETTINGS — PROJECT CONFIG
  // ══════════════════════════════════════════════════════════════════════════

  function _getConfig() {
    return {
      org: ($("adoOrg") && $("adoOrg").value.trim()) || "",
      project: ($("adoProject") && $("adoProject").value.trim()) || "",
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UNIFIED LLM CALL
  // ══════════════════════════════════════════════════════════════════════════

  async function _callLlm({ systemPrompt, userMessage, onChunk, onDone, onError }) {
    const { id, config } = _getProviderConfig();
    let res;
    try {
      res = await fetch("/api/llm/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id, config, systemPrompt, userMessage }),
      });
    } catch (err) {
      onError(`Network error: ${err.message}`);
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error || `HTTP ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === "chunk" && onChunk) onChunk(ev.text);
            else if (ev.type === "done" && onDone) onDone();
            else if (ev.type === "error" && onError) onError(ev.message);
          } catch {
            console.warn("LLM SSE: failed to parse event", line.slice(0, 100));
          }
        }
      }
    } catch (err) {
      if (onError) onError(`Stream error: ${err.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAN SCENARIOS — generate titles via LLM
  // ══════════════════════════════════════════════════════════════════════════

  const PLAN_SYSTEM_PROMPT = `You are a senior QA engineer planning Azure DevOps test case titles.
Your job is to produce a structured, coverage-complete list of scenario titles — nothing more. No JSON, no steps, no expected results.
Titles will be reviewed and filtered by the user, then expanded into full ADO test cases.

Output a markdown list grouped by category:

## {Category}

- {title 1}
- {title 2}

Use categories: Happy path, Negative / errors, Permission variants, State transitions, Data boundaries, Concurrent/session, Integration points, Recovery.

Title pattern:  {Feature/Area} — {Action} ({context}) | {Variant or Condition}

No prose outside the title list.`;

  async function planScenarios() {
    if (_plannerStreaming) return;
    const desc = ($("plannerDesc") && $("plannerDesc").value.trim()) || "";
    const section = ($("plannerSection") && $("plannerSection").value.trim()) || "";
    if (!desc && !_attachedFileContent) { alert("Please describe the feature area or attach a file."); return; }

    let userMessage = "";
    if (_attachedFileContent) {
      userMessage += `File "${_attachedFileName}":\n---\n${_attachedFileContent}\n---\n\n`;
      userMessage += section ? `Focus on: "${section}".\n\n` : "Use full file.\n\n";
    }
    if (desc) userMessage += `Context:\n${desc}\n\n`;
    userMessage += "Generate a grouped markdown list of test scenario titles.";

    _plannerStreaming = true;
    _setPlannerBtns(true);
    const outputEl = $("plannerOutput");
    const statusEl = $("plannerStatus");
    const acceptBtn = $("plannerAcceptBtn");
    if (outputEl) outputEl.value = "";
    if (acceptBtn) acceptBtn.disabled = true;
    if (statusEl) { statusEl.textContent = "Generating…"; statusEl.className = "ado-parse-status"; }

    await _callLlm({
      systemPrompt: PLAN_SYSTEM_PROMPT,
      userMessage,
      onChunk(text) { if (outputEl) { outputEl.value += text; outputEl.scrollTop = outputEl.scrollHeight; } },
      onDone() {
        if (statusEl) { statusEl.textContent = "✓ Done — review and edit, then click Accept → JSON"; statusEl.className = "ado-parse-status ok"; }
        if (acceptBtn) acceptBtn.disabled = false;
      },
      onError(msg) { if (statusEl) { statusEl.textContent = `✗ ${msg}`; statusEl.className = "ado-parse-status err"; } },
    });

    _plannerStreaming = false;
    _setPlannerBtns(false);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACCEPT SCENARIOS — convert titles to JSON
  // ══════════════════════════════════════════════════════════════════════════

  const GENERATE_SYSTEM_PROMPT = `You are generating Azure DevOps test case objects. Output a single valid JSON array — nothing else. No markdown fences, no prose.
Each element: { "title": "...", "tags": ["..."], "steps": [{ "action": "...", "expected": "..." }] }
Rules: min 4 steps, one action per step, first step = precondition, last step = verification, use title exactly as given, derive tags from title segments.`;

  async function acceptScenarios() {
    if (_generateStreaming) return;
    const outputEl = $("plannerOutput");
    const markdown = (outputEl && outputEl.value.trim()) || "";
    if (!markdown) { alert("Generate scenarios first."); return; }

    const titles = markdown.split("\n").filter((l) => l.trim().startsWith("- ")).map((l) => l.trim().slice(2).trim()).filter(Boolean).join("\n");
    if (!titles) { alert("No scenario titles found. Expected lines starting with '- '."); return; }

    _generateStreaming = true;
    const statusEl = $("plannerStatus");
    const acceptBtn = $("plannerAcceptBtn");
    const genBtn = $("plannerGenBtn");
    if (acceptBtn) acceptBtn.disabled = true;
    if (genBtn) genBtn.disabled = true;
    if (statusEl) { statusEl.textContent = "Converting to JSON…"; statusEl.className = "ado-parse-status"; }
    const scenariosLoader = $("scenariosLoader");
    if (scenariosLoader) scenariosLoader.style.display = "flex";
    const scenariosInput = $("adoScenariosInput");
    if (scenariosInput) scenariosInput.value = "";
    let jsonText = "";

    await _callLlm({
      systemPrompt: GENERATE_SYSTEM_PROMPT,
      userMessage: `Convert these titles to ADO JSON:\n\n${titles}`,
      onChunk(text) { jsonText += text; if (scenariosInput) scenariosInput.value = jsonText; },
      onDone() {
        const cleaned = jsonText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
        if (scenariosInput) scenariosInput.value = cleaned;
        if (scenariosLoader) scenariosLoader.style.display = "none";
        _setPipelineStage("generate");
        parseScenarios();
        if (statusEl) { statusEl.textContent = "✓ JSON populated — review and create in ADO"; statusEl.className = "ado-parse-status ok"; }
        scrollTo("adoScenariosInput");
      },
      onError(msg) {
        if (statusEl) { statusEl.textContent = `✗ ${msg}`; statusEl.className = "ado-parse-status err"; }
        if (scenariosLoader) scenariosLoader.style.display = "none";
      },
    });

    _generateStreaming = false;
    if (acceptBtn) acceptBtn.disabled = false;
    if (genBtn) genBtn.disabled = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONVERT SCENARIOS — direct title paste → JSON
  // ══════════════════════════════════════════════════════════════════════════

  async function convertScenarios() {
    if (_convertStreaming) return;
    const inputEl = $("convertInput");
    const statusEl = $("convertStatus");
    const btn = $("convertBtn");
    const raw = (inputEl && inputEl.value.trim()) || "";
    if (!raw) { alert("Paste at least one scenario title."); return; }

    const titles = raw.split("\n").map((l) => l.replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, "").trim()).filter(Boolean).join("\n");

    _convertStreaming = true;
    if (btn) btn.disabled = true;
    if (statusEl) { statusEl.textContent = "Converting to JSON…"; statusEl.className = "ado-parse-status"; }
    const scenariosLoader = $("scenariosLoader");
    if (scenariosLoader) scenariosLoader.style.display = "flex";
    const scenariosInput = $("adoScenariosInput");
    if (scenariosInput) scenariosInput.value = "";
    let jsonText = "";

    await _callLlm({
      systemPrompt: GENERATE_SYSTEM_PROMPT,
      userMessage: `Convert these titles to ADO JSON:\n\n${titles}`,
      onChunk(text) { jsonText += text; if (scenariosInput) scenariosInput.value = jsonText; },
      onDone() {
        const cleaned = jsonText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
        if (scenariosInput) scenariosInput.value = cleaned;
        if (scenariosLoader) scenariosLoader.style.display = "none";
        _setPipelineStage("generate");
        parseScenarios();
        if (statusEl) { statusEl.textContent = "✓ JSON populated — review and create in ADO"; statusEl.className = "ado-parse-status ok"; }
        scrollTo("adoScenariosInput");
      },
      onError(msg) {
        if (statusEl) { statusEl.textContent = `✗ ${msg}`; statusEl.className = "ado-parse-status err"; }
        if (scenariosLoader) scenariosLoader.style.display = "none";
      },
    });

    _convertStreaming = false;
    if (btn) btn.disabled = false;
  }

  function _setPlannerBtns(streaming) {
    const genBtn = $("plannerGenBtn");
    const acceptBtn = $("plannerAcceptBtn");
    if (genBtn) genBtn.disabled = streaming;
    if (streaming && acceptBtn) acceptBtn.disabled = true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AI TAB SWITCHING
  // ══════════════════════════════════════════════════════════════════════════

  function switchAiTab(tab, el) {
    const target = `aiTab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`;
    ["aiTabPlan", "aiTabConvert"].forEach((id) => {
      const p = $(id);
      if (p) p.classList.toggle("hidden", id !== target);
    });
    ["aiTabBtnPlan", "aiTabBtnConvert"].forEach((id) => {
      const b = $(id);
      if (b) b.classList.remove("active");
    });
    if (el) el.classList.add("active");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PARSE SCENARIOS
  // ══════════════════════════════════════════════════════════════════════════

  function parseScenarios() {
    const raw = ($("adoScenariosInput") && $("adoScenariosInput").value) || "";
    const statusEl = $("adoParseStatus");
    if (!raw.trim()) {
      _parsedScenarios = [];
      if (statusEl) { statusEl.textContent = "Paste your scenario JSON above, then click Parse."; statusEl.className = "ado-parse-status"; }
      _setRunBtn(false);
      return;
    }
    let parsed;
    try { parsed = JSON.parse(raw.trim()); } catch (e) {
      _parsedScenarios = [];
      if (statusEl) { statusEl.textContent = `✗ JSON parse error: ${e.message}`; statusEl.className = "ado-parse-status err"; }
      _setRunBtn(false);
      return;
    }
    if (!Array.isArray(parsed)) {
      _parsedScenarios = [];
      if (statusEl) { statusEl.textContent = "✗ Expected a JSON array."; statusEl.className = "ado-parse-status err"; }
      _setRunBtn(false);
      return;
    }
    const invalid = [];
    const valid = [];
    for (let i = 0; i < parsed.length; i++) {
      const s = parsed[i];
      if (!s.title) invalid.push(`[${i}] missing "title"`);
      else if (!Array.isArray(s.steps) || s.steps.length === 0) invalid.push(`[${i}] "${s.title.slice(0, 60)}…" — no steps`);
      else valid.push(s);
    }
    if (!valid.length) {
      _parsedScenarios = [];
      if (statusEl) { statusEl.textContent = `✗ No valid scenarios found. Try regenerating.`; statusEl.className = "ado-parse-status err"; }
      _setRunBtn(false);
      return;
    }
    _parsedScenarios = valid;
    _setPipelineStage("create");
    if (statusEl) {
      if (invalid.length) { statusEl.textContent = `⚠ ${valid.length} ready — ${invalid.length} skipped`; statusEl.className = "ado-parse-status"; statusEl.style.color = "#b45309"; }
      else { statusEl.textContent = `✓ ${valid.length} scenario${valid.length !== 1 ? "s" : ""} ready`; statusEl.className = "ado-parse-status ok"; statusEl.style.color = ""; }
    }
    _setRunBtn(true);
    _renderResultTable();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FILE ATTACHMENT
  // ══════════════════════════════════════════════════════════════════════════

  function _readFileAsText(file) {
    return new Promise((resolve, reject) => {
      if (file.size === 0) { reject(new Error("File is empty (0 bytes).")); return; }
      const MAX_BYTES = 400_000;
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error("Could not read file."));
      if (file.size > MAX_BYTES) reader.readAsText(file.slice(0, MAX_BYTES));
      else reader.readAsText(file);
    });
  }

  function _resetDropZone(hasFile) {
    const dz = $("plannerDropZone");
    if (!dz) return;
    dz.style.borderColor = hasFile ? "#00897b" : "#b2dfdb";
    dz.style.background = hasFile ? "#e8f5e9" : "#f9fffe";
  }

  function _applyFileToUI(name, content, truncated) {
    _attachedFileName = name;
    _attachedFileContent = content;
    const nameEl = $("plannerFileName");
    const clearBtn = $("plannerFileClear");
    if (nameEl) {
      let label = `📄 ${name}  (${(content.length / 1024).toFixed(1)} KB)`;
      if (truncated) label += " — truncated at 400 KB";
      nameEl.textContent = label;
    }
    if (clearBtn) clearBtn.style.display = "";
    _resetDropZone(true);
  }

  function fileSelected(input) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    const statusEl = $("plannerStatus");
    if (statusEl) { statusEl.textContent = "Reading file…"; statusEl.className = "ado-parse-status"; }
    _readFileAsText(file).then((text) => _applyFileToUI(file.name, text, file.size > 400_000)).catch((err) => {
      if (statusEl) { statusEl.textContent = `✗ ${err.message}`; statusEl.className = "ado-parse-status err"; }
    });
  }

  function fileDragOver(event) {
    event.preventDefault();
    const dz = $("plannerDropZone");
    if (dz) { dz.style.borderColor = "#00695c"; dz.style.background = "#e0f2f1"; }
  }

  function fileDragLeave(event) {
    event.preventDefault();
    _resetDropZone(!!_attachedFileName);
  }

  function fileDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    const statusEl = $("plannerStatus");
    if (statusEl) { statusEl.textContent = "Reading file…"; statusEl.className = "ado-parse-status"; }
    _readFileAsText(file).then((text) => _applyFileToUI(file.name, text, file.size > 400_000)).catch((err) => {
      if (statusEl) { statusEl.textContent = `✗ ${err.message}`; statusEl.className = "ado-parse-status err"; }
    });
  }

  function clearAttachedFile() {
    _attachedFileName = "";
    _attachedFileContent = "";
    const nameEl = $("plannerFileName");
    const clearBtn = $("plannerFileClear");
    const fileInput = $("plannerFileInput");
    if (nameEl) nameEl.textContent = "Attach a file (optional) — drag & drop or click to browse";
    if (clearBtn) clearBtn.style.display = "none";
    _resetDropZone(false);
    if (fileInput) fileInput.value = "";
  }

  function openFilePicker() {
    const input = $("plannerFileInput");
    if (!input) return;
    input.value = "";
    input.click();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LAUNCH CHROME
  // ══════════════════════════════════════════════════════════════════════════

  async function launchChrome() {
    const btn = $("adoRunBtn");
    const launchBtn = $("adoLaunchBtn");
    const statusEl = $("adoChromeStatus");
    const config = _getConfig();
    if (launchBtn) launchBtn.disabled = true;
    if (statusEl) { statusEl.textContent = "Launching Chrome…"; statusEl.className = "ado-step-status"; }
    try {
      const res = await fetch("/api/ado/launch-chrome", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ org: config.org, project: config.project }) });
      const data = await res.json();
      if (data.ok) {
        if (statusEl) { statusEl.innerHTML = `✓ Chrome launched — <a href="${escHtml(data.url)}" target="_blank" style="color:#818cf8">open ADO</a> &nbsp;·&nbsp; Sign in`; statusEl.className = "ado-step-status ok"; }
      } else {
        if (statusEl) { statusEl.textContent = `✗ ${data.error || "Unknown error"}`; statusEl.className = "ado-step-status err"; }
      }
    } catch (err) {
      if (statusEl) { statusEl.textContent = `✗ ${err.message}`; statusEl.className = "ado-step-status err"; }
    } finally {
      if (launchBtn) launchBtn.disabled = false;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CREATE TEST CASES
  // ══════════════════════════════════════════════════════════════════════════

  async function startRun() {
    if (_isRunning) return;
    const config = _getConfig();
    if (!config.org || !config.project) { alert("Please fill in ADO Organisation and ADO Project in Settings."); return; }
    if (!_parsedScenarios.length) { alert("Parse your scenarios first."); return; }
    if (!confirm(`Create ${_parsedScenarios.length} test case${_parsedScenarios.length !== 1 ? "s" : ""} in ${config.org}/${config.project}?`)) return;

    _isRunning = true;
    _resultRows = [];
    _setRunBtn(false);
    _clearLog();
    _renderResultTable();
    _setPipelineStage("create");
    _log(`Starting — ${_parsedScenarios.length} scenario${_parsedScenarios.length !== 1 ? "s" : ""}`, "info");

    let response;
    try { response = await fetch("/api/ado/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarios: _parsedScenarios, config }) }); }
    catch (err) { _log(`Network error: ${err.message}`, "error"); _isRunning = false; _setRunBtn(true); return; }
    if (!response.ok && !response.body) { _log(`Server error ${response.status}`, "error"); _isRunning = false; _setRunBtn(true); return; }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try { _handleEvent(JSON.parse(line)); } catch (e) { console.warn("startRun: parse error", line.slice(0, 100)); }
        }
      }
    } catch (err) { _log(`Stream error: ${err.message}`, "error"); }
    _isRunning = false;
    _setRunBtn(_parsedScenarios.length > 0);
  }

  function _handleEvent(ev) {
    switch (ev.type) {
      case "log": _log(ev.message); break;
      case "error": _log(`✗ ${ev.message}`, "error"); break;
      case "status": _log(`${ev.total} queued`, "info"); break;
      case "case-done": _onCaseDone(ev); break;
      case "done": _log(`Done — Created: ${ev.totalCreated} Failed: ${ev.totalFailed}`, ev.totalFailed > 0 ? "error" : "success"); _updateSummary(ev.totalCreated, ev.totalFailed); _setPipelineStage("results"); break;
      default: console.warn("_handleEvent: unknown", ev.type, ev);
    }
  }

  function _onCaseDone(ev) {
    _resultRows[ev.index] = ev;
    _renderResultRow(ev.index, ev);
    const label = (ev.tags || []).join(" · ") || ev.title;
    if (ev.status === "created") _log(`  ✓ ${label} — ID: ${ev.id}`, "success");
    else if (ev.status === "failed") _log(`  ✗ ${label} — HTTP ${ev.httpStatus}`, "error");
    else _log(`  ✗ ${label} — ${ev.error}`, "error");
  }

  function _clearLog() { const el = $("adoLog"); if (el) el.innerHTML = ""; }

  function _log(msg, cls) {
    const el = $("adoLog");
    if (!el) return;
    const span = document.createElement("span");
    if (cls) span.className = `log-${cls}`;
    span.textContent = msg + "\n";
    el.appendChild(span);
    el.scrollTop = el.scrollHeight;
  }

  function _renderResultTable() {
    const tbody = $("adoResultsTbody");
    const wrap = $("adoResultsWrap");
    if (!tbody || !wrap) return;
    if (!_parsedScenarios.length) { wrap.classList.remove("visible"); return; }
    wrap.classList.add("visible");
    tbody.innerHTML = "";
    for (let i = 0; i < _parsedScenarios.length; i++) {
      const s = _parsedScenarios[i];
      const tr = document.createElement("tr");
      tr.id = `ado-row-${i}`;
      const tagPills = (s.tags || []).map((t) => `<span class="ado-tag">${escHtml(t)}</span>`).join("");
      tr.innerHTML = `<td>${i + 1}</td><td class="ado-title-cell" title="${escHtml(s.title)}">${escHtml(s.title)}</td><td class="ado-tags-cell">${tagPills}</td><td class="ado-status-cell"><span class="ado-badge-pending">—</span></td><td>—</td>`;
      tbody.appendChild(tr);
    }
  }

  function _renderResultRow(index, ev) {
    const tr = $(`ado-row-${index}`);
    if (!tr) return;
    const tds = tr.querySelectorAll("td");
    if (tds.length < 5) return;
    if (ev.status === "created") {
      tds[3].innerHTML = `<span class="ado-badge-created">✓ Created</span>`;
      tds[4].innerHTML = ev.adoUrl ? `<a class="ado-id-link" href="${escHtml(ev.adoUrl)}" target="_blank">#${ev.id}</a>` : `#${ev.id}`;
    } else if (ev.status === "failed") { tds[3].innerHTML = `<span class="ado-badge-failed">✗ HTTP ${ev.httpStatus}</span>`; tds[4].textContent = "—"; }
    else { tds[3].innerHTML = `<span class="ado-badge-failed">✗ Error</span>`; tds[4].title = ev.error || ""; tds[4].textContent = "—"; }
  }

  function _updateSummary(created, failed) {
    const bar = $("adoSummaryBar");
    if (!bar) return;
    bar.classList.add("visible");
    const cEl = bar.querySelector(".sum-created");
    const fEl = bar.querySelector(".sum-failed");
    const tEl = bar.querySelector(".sum-total");
    if (cEl) cEl.textContent = created;
    if (fEl) fEl.textContent = failed;
    if (tEl) tEl.textContent = created + failed;
  }

  function _setRunBtn(enabled) {
    const btn = $("adoRunBtn");
    if (btn) btn.disabled = !enabled || _isRunning;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLEAR ALL
  // ══════════════════════════════════════════════════════════════════════════

  function clearAll() {
    _parsedScenarios = [];
    _resultRows = [];
    const plannerDesc = $("plannerDesc"); if (plannerDesc) plannerDesc.value = "";
    const plannerOutput = $("plannerOutput"); if (plannerOutput) plannerOutput.value = "";
    const plannerSection = $("plannerSection"); if (plannerSection) plannerSection.value = "";
    const plannerStatus = $("plannerStatus"); if (plannerStatus) { plannerStatus.textContent = "Describe your feature above and click Generate."; plannerStatus.className = "ado-parse-status"; }
    const acceptBtn = $("plannerAcceptBtn"); if (acceptBtn) acceptBtn.disabled = true;
    clearAttachedFile();
    const convertInput = $("convertInput"); if (convertInput) convertInput.value = "";
    const convertStatus = $("convertStatus"); if (convertStatus) { convertStatus.textContent = "Paste titles above and click Convert → JSON."; convertStatus.className = "ado-parse-status"; }
    const convertBtn = $("convertBtn"); if (convertBtn) convertBtn.disabled = false;
    const inp = $("adoScenariosInput"); if (inp) inp.value = "";
    const scenariosLoader = $("scenariosLoader"); if (scenariosLoader) scenariosLoader.style.display = "none";
    const statusEl = $("adoParseStatus"); if (statusEl) { statusEl.textContent = "Paste your scenario JSON above, then click Parse."; statusEl.className = "ado-parse-status"; }
    const chromeStatus = $("adoChromeStatus"); if (chromeStatus) { chromeStatus.textContent = ""; chromeStatus.className = "ado-step-status"; }
    const tbody = $("adoResultsTbody"); if (tbody) tbody.innerHTML = "";
    const wrap = $("adoResultsWrap"); if (wrap) wrap.classList.remove("visible");
    const bar = $("adoSummaryBar"); if (bar) bar.classList.remove("visible");
    _clearLog();
    _setRunBtn(false);
    _setPipelineStage("plan");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PIPELINE STEPPER (4 stages: plan, generate, create, results)
  // ══════════════════════════════════════════════════════════════════════════

  const STAGES = ["plan", "generate", "create", "results"];

  function _setPipelineStage(stage) {
    const idx = STAGES.indexOf(stage);
    if (idx === -1) return;
    STAGES.forEach((s, i) => {
      const el = document.querySelector(`[data-pipeline="${s}"]`);
      if (!el) return;
      el.className = "pipeline-step";
      if (i < idx) el.classList.add("done");
      else if (i === idx) el.classList.add("active");
      else el.classList.add("pending");
      const parent = el.parentElement;
      if (parent) {
        const prev = el.previousElementSibling;
        if (prev && prev.classList.contains("pipeline-connector")) {
          prev.className = "pipeline-connector";
          if (i <= idx) prev.classList.add("done");
          if (i === idx) prev.classList.add("active");
        }
      }
    });
    const badgeMap = { plan: "planBadge", generate: "generateBadge", create: "createBadge", results: "resultsBadge" };
    Object.entries(badgeMap).forEach(([s, badgeId]) => {
      const badge = $(badgeId);
      if (!badge) return;
      const si = STAGES.indexOf(s);
      badge.className = "section-badge";
      if (si < idx) { badge.textContent = "✓ Done"; badge.classList.add("done"); }
      else if (si === idx) { badge.textContent = "● In Progress"; badge.classList.add("active"); }
      else { badge.textContent = "○ Pending"; badge.classList.add("pending"); }
    });
    const cardMap = { plan: "adoPlanCard", generate: "adoGenerateCard", create: "adoCreateCard" };
    Object.entries(cardMap).forEach(([s, cardId]) => {
      const card = $(cardId);
      if (!card) return;
      const si = STAGES.indexOf(s);
      card.className = "card card-emphasis";
      if (si < idx) card.classList.add("done");
      else if (si === idx) card.classList.add("active");
    });
  }

  function scrollTo(elementId) {
    const el = $(elementId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return {
    init,
    switchAppTab,
    onProviderChange,
    testProviderConnection,
    switchAiTab,
    planScenarios,
    acceptScenarios,
    convertScenarios,
    parseScenarios,
    fileSelected, fileDragOver, fileDragLeave, fileDrop, clearAttachedFile, openFilePicker,
    launchChrome,
    startRun,
    clearAll,
    scrollTo,
  };
})();

document.addEventListener("DOMContentLoaded", () => AdoApp.init());
