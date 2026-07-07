<div align="center">
  <h1>TestForge</h1>
  <p><strong>AI-powered test case generation for Azure DevOps</strong></p>
  <p>Requirements → ADO Test Cases. Three AI agents. One click.</p>

  <p>
    <a href="#quick-start"><img src="https://img.shields.io/badge/-Try%20in%2030%20seconds-2563EB?style=for-the-badge" alt="Try in 30 seconds"></a>
    <a href="https://github.com/sritajkumarpatel/TestForge/actions/workflows/ci.yml"><img src="https://github.com/USER/TestForge/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node">
    <img src="https://img.shields.io/github/stars/USER/TestForge?style=social" alt="Stars">
  </p>
</div>

---

## The Problem

> Manual test case creation is the #1 bottleneck in QA cycles. writing 100+ test cases per sprint takes **days**, coverage is inconsistent, and Azure DevOps' UI makes bulk creation painful.

**TestForge solves this.** Feed it a requirements document, an ADO work item, or plain text — three autonomous AI agents analyze, design, and produce ready-to-create ADO test cases in **under 3 minutes**.

---

## How It Works

```
Requirements → [Requirements Analyst] → [Test Designer] → [Test Case Writer] → ADO Test Cases
```

| Agent | Role | Techniques |
|-------|------|-----------|
| **Requirements Analyst** | Parses raw input into structured functional requirements | NLP extraction, ambiguity detection, gap analysis |
| **Test Designer** | Applies systematic test design techniques | Equivalence Partitioning, BVA, State Transition, Decision Tables, Pairwise & more |
| **Test Case Writer** | Produces a JSON array of ADO-ready test case objects | Step-by-step imperative actions, precondition → verification |

Each agent receives the full output of the previous agent, building context sequentially. Supports both **regular** and **BDD (Gherkin)** test formats.

---

## Why TestForge?

| | Manual Process | TestForge |
|---|---------------|-----------|
| ⏱ **Time per 100 test cases** | 2–3 days | 2–3 minutes |
| 🧠 **Test design technique coverage** | Depends on individual expertise | 8 systematic techniques applied automatically |
| 📋 **Coverage gaps** | Common (fatigue, time pressure) | Traceable per-scenario with technique tagging |
| 🔄 **Re-work on requirement changes** | Days of manual rewriting | Re-run the pipeline |
| 🏗 **ADO creation** | Manual copy-paste per test case | One-click bulk creation via Chrome CDP |
| 💰 **Cost** | Salaried QA engineer hours | Free (Ollama) or pennies in API costs |

---

## Features

- **3 input modes** — Upload files (PDF, Word, Markdown), fetch ADO work items, or paste text
- **5 LLM providers** — Ollama (local), OpenAI, Claude, Google Gemini, OpenCode
- **Regular + BDD output** — Choose between structured test cases or Gherkin-style scenarios
- **Streaming pipeline** — Watch each agent reason in real time via SSE
- **One-click ADO creation** — Uses your browser session via Playwright CDP — no PAT needed
- **Chrome sign-in prerequisite** — Dedicated sign-in step before loading requirements; Pipeline tracks sign-in status
- **State persistence** — Input data, agent logs, and settings survive tab switches between Pipeline and Settings
- **Safe tab switching** — Confirm dialog when switching tabs while agents are running; cancels on approval
- **Uniform settings save** — Save buttons in both Project Details and LLM Provider cards
- **JSON import/export** — Download, edit externally, re-upload
- **Works offline** — Use Ollama with local models, zero cloud dependency

---

## Quick Start

```bash
# 1. Clone & install
git clone https://github.com/USER/TestForge.git
cd testforge
npm install && cd client && npm install && cd ..

# 2. Configure (copy and edit .env)
cp .env.example .env

# 3. Run
node server.js
```

Open **http://localhost:3010** in your browser.

---

## Screenshots

> *Screenshots coming soon — see the live pipeline in action.*

| Pipeline | Settings | Test Results |
|----------|----------|-------------|
| *(screenshot)* | *(screenshot)* | *(screenshot)* |

---

## Configuration

| Variable | Default | Required For |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | OpenAI provider |
| `CLAUDE_API_KEY` | — | Anthropic Claude |
| `GOOGLE_API_KEY` | — | Google Gemini |
| `OPENCODE_API_KEY` | — | OpenCode |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama (local) |
| `ADO_ORG` / `ADO_PROJECT` | — | Pre-fills ADO settings |
| `CHROME_PATH` | Auto-detected | One-click ADO creation |
| `PORT` | `3010` | Server port |

Full reference in [.env.example](.env.example). API keys can also be set per-session in the Settings UI.

---

## LLM Providers

| Provider | Cost | Setup |
|----------|------|-------|
| **Ollama** | Free (local) | `ollama pull llama3.2` |
| **OpenAI** | Pay-per-token | Set `OPENAI_API_KEY` |
| **Claude** | Pay-per-token | Set `CLAUDE_API_KEY` |
| **Gemini** | Free tier available | Set `GOOGLE_API_KEY` |
| **OpenCode** | Free tier available | Set `OPENCODE_API_KEY` |

---

## Project Structure

```
testforge/
├── server.js               # Express server — all API routes
├── llm-providers.js        # Provider abstraction (Ollama, OpenAI, Claude, Google, OpenCode)
├── agent-pipeline.js       # 3-agent sequential orchestration
├── agents/                 # Agent persona prompts
│   ├── 01-requirements-analyst.md
│   ├── 02-test-designer.md
│   ├── 02-test-designer-bdd.md
│   └── 03-test-case-writer.md
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   └── index.css
│   └── package.json
├── .env.example
└── package.json
```

---

## Tech Stack

**Backend:** Node.js, Express, Playwright (CDP), multer<br>
**Frontend:** React 18, Vite 6, vanilla CSS<br>
**Parsing:** pdf-parse (PDF), mammoth (Word)<br>
**LLM APIs:** Ollama, OpenAI, Anthropic Claude, Google Gemini, OpenCode

---

## Development

```bash
# Terminal 1 — Express server (port 3010)
node server.js

# Terminal 2 — Vite dev server (port 5173, proxies /api to :3010)
cd client && npm run dev
```

---

## Roadmap

- [x] Multi-LLM provider support
- [x] BDD/Gherkin output mode
- [x] Chrome CDP one-click ADO creation
- [x] Streaming pipeline with real-time agent logs
- [x] State persistence across tab switches
- [ ] Jira export integration
- [ ] CI/CD pipeline integration (GitHub Actions, ADO Pipelines)
- [ ] Custom agent prompt editor
- [ ] Test coverage reporting
- [ ] Plugin system for custom test design techniques

---

## Contributing

Contributions are welcome! See [open issues](https://github.com/USER/TestForge/issues) for good first issues. PRs, feature requests, and bug reports are all appreciated.

---

## License

MIT © 2026 Sritaj Kumar Patel

---

<div align="center">
  <p>If TestForge saves you time, <strong>star the repo ⭐</strong> — it helps others find it too.</p>
  <p>
    <a href="https://github.com/USER/TestForge/stargazers"><img src="https://img.shields.io/github/stars/USER/TestForge?style=social" alt="Stars"></a>
    <a href="https://github.com/USER/TestForge/forks"><img src="https://img.shields.io/github/forks/USER/TestForge?style=social" alt="Forks"></a>
  </p>
</div>
