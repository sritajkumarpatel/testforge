<div align="center">

# TestForge ⚒️

### AI-Powered Test Case Generation for Azure DevOps

**Requirements → ADO Test Cases. Three AI agents. One click.**

[![CI](https://img.shields.io/github/actions/workflow/status/sritajkumarpatel/testforge/ci.yml?branch=main&style=flat-square)](https://github.com/sritajkumarpatel/testforge/actions)
[![npm](https://img.shields.io/npm/v/testforge?style=flat-square)](https://www.npmjs.com/package/testforge)
[![GitHub stars](https://img.shields.io/github/stars/sritajkumarpatel/testforge?style=flat-square)](https://github.com/sritajkumarpatel/testforge/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/sritajkumarpatel/testforge?style=flat-square)](https://github.com/sritajkumarpatel/testforge/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)

[Quick Start](#quick-start) · [How It Works](#how-it-works) · [Why TestForge](#why-testforge) · [Features](#features) · [Configuration](#configuration) · [Development](#development)

---

</div>

## The Problem

> Manual test case creation is the #1 bottleneck in QA cycles. Writing 100+ test cases per sprint takes **days**, coverage is inconsistent, and Azure DevOps' UI makes bulk creation painful.

TestForge solves this — feed it a requirements document, an ADO work item, or plain text, and three autonomous AI agents analyze, design, and produce ready-to-create ADO test cases in **under 3 minutes**.

## The Solution

You don't write test cases — you **have a conversation** with three AI agents. Load your requirements, and watch each agent reason in real time:

```
You: Load a requirements PDF
Agent 1 (Requirements Analyst): "I found 12 functional requirements with 2 ambiguity gaps..."
Agent 2 (Test Designer): "Applying equivalence partitioning, boundary value analysis, and state transition..."
Agent 3 (Test Case Writer): "Produced 48 ADO-ready test cases with preconditions and verification steps."
You: Click "Create in Azure DevOps" → 48 test cases created in 15 seconds.
```

No manual test writing. No tedious copy-paste into ADO. Just your requirements + three AI agents + one click.

## How It Works

```
Requirements → [Requirements Analyst] → [Classifier] → [UI / API / Mock Designers] → [Test Case Writer] → ADO Test Cases
```

| Agent | Role | Specialism |
|---|---|---|
| **Requirements Analyst** | Parses raw input into structured functional requirements | NLP extraction, ambiguity detection, gap analysis |
| **Classifier** | Decides whether the requirement is UI, API, Mock, or mixed | Requirement-type routing |
| **UI Test Designer** | Designs UI/UX scenarios | Forms, navigation, validation, accessibility, responsive behavior |
| **API Test Designer** | Designs API scenarios | HTTP contracts, auth, status codes, schema, rate limits |
| **Mock & Service Virtualization Designer** | Provides mock/stub guidelines | External dependency simulation, contract testing |
| **Test Case Writer** | Produces a JSON array of ADO-ready test case objects | Step-by-step imperative actions, precondition → verification |

Each agent receives the full output of the previous agent, building context sequentially. Supports both **regular** and **BDD (Gherkin)** test formats.

## Why TestForge?

| | Manual Process | TestForge |
|---|---|---|
| ⏱ **Time per 100 test cases** | 2–3 days | 2–3 minutes |
| 🧠 **Test design technique coverage** | Depends on individual expertise | 8 systematic techniques applied automatically |
| 📋 **Coverage gaps** | Common (fatigue, time pressure) | Traceable per-scenario with technique tagging |
| 🔄 **Re-work on requirement changes** | Days of manual rewriting | Re-run the pipeline |
| 🏗 **ADO creation** | Manual copy-paste per test case | One-click bulk creation via Chrome CDP |
| 💰 **Cost** | Salaried QA engineer hours | Free (Ollama) or pennies in API costs |

## Features

### Input & Pipeline

| Feature | Description |
|---|---|
| **3 input modes** | Upload files (PDF, Word, Markdown), fetch ADO work items, or paste text |
| **Streaming pipeline** | Watch each agent reason in real time via SSE |
| **Regular + BDD output** | Choose between structured test cases or Gherkin-style scenarios |
| **JSON import/export** | Download raw output, edit externally, re-upload |

### Azure DevOps Integration

| Feature | Description |
|---|---|
| **One-click ADO creation** | Uses your browser session via Playwright CDP — no PAT needed |
| **Chrome sign-in prerequisite** | Dedicated sign-in step before loading requirements; Pipeline tracks sign-in status |
| **Bulk work item creation** | Creates all test cases as ADO work items in parallel |

### UI & UX

| Feature | Description |
|---|---|
| **State persistence** | Input data, agent logs, and settings survive tab switches |
| **Safe tab switching** | Confirm dialog when switching while agents are running |
| **Uniform settings save** | Save buttons in both Project Details and LLM Provider cards |

### LLM Support

| Feature | Description |
|---|---|
| **5 LLM providers** | Ollama (local), OpenAI, Claude, Google Gemini, OpenCode |
| **Works offline** | Use Ollama with local models — zero cloud dependency |

## Quick Start

### Option 1: AI Agent Setup (Recommended)

Open the repo with your AI coding agent:

```bash
git clone https://github.com/sritajkumarpatel/testforge.git
cd testforge
opencode .
# or: claude .
# or: code . (with Copilot Codex)

# Then say:
"Set up and run TestForge"
```

The agent will configure, install dependencies, and start the server.

### Option 2: Manual Setup

```bash
# 1. Clone & install
git clone https://github.com/sritajkumarpatel/testforge.git
cd testforge
npm install && cd client && npm install && cd ..

# 2. Configure (copy and edit .env)
cp .env.example .env

# 3. Run
node server.js
```

Open **http://localhost:3010** in your browser.

## Screenshots

> *Screenshots coming soon — see the live pipeline in action.*

| Pipeline | Settings | Test Results |
|---|---|---|
| *(screenshot)* | *(screenshot)* | *(screenshot)* |

## Configuration

| Variable | Default | Required For |
|---|---|---|
| `OPENAI_API_KEY` | — | OpenAI provider |
| `CLAUDE_API_KEY` | — | Anthropic Claude |
| `GOOGLE_API_KEY` | — | Google Gemini |
| `OPENCODE_API_KEY` | — | OpenCode |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama (local) |
| `ADO_ORG` / `ADO_PROJECT` | — | Pre-fills ADO settings |
| `CHROME_PATH` | Auto-detected | One-click ADO creation |
| `PORT` | `3010` | Server port |

Full reference in [.env.example](.env.example). API keys can also be set per-session in the Settings UI.

## LLM Providers

| Provider | Cost | Setup |
|---|---|---|
| **Ollama** | Free (local) | `ollama pull llama3.2` |
| **OpenAI** | Pay-per-token | Set `OPENAI_API_KEY` |
| **Claude** | Pay-per-token | Set `CLAUDE_API_KEY` |
| **Gemini** | Free tier available | Set `GOOGLE_API_KEY` |
| **OpenCode** | Free tier available | Set `OPENCODE_API_KEY` |

## Project Structure

```
testforge/
├── server.js               # Express server — all API routes
├── llm-providers.js        # Provider abstraction (Ollama, OpenAI, Claude, Google, OpenCode)
├── agent-pipeline.js       # 3-agent sequential orchestration
├── agents/                 # Agent persona prompts
│   ├── 00-classifier.md
│   ├── 01-requirements-analyst.md
│   ├── 02-ui-designer.md
│   ├── 02-api-designer.md
│   ├── 02-mock-designer.md
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

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | 18+ | Runtime |
| **Express** | 4 | Web server & API routes |
| **React** | 18 | UI framework |
| **Vite** | 6 | Build tool & dev server |
| **Playwright** | — | Chrome CDP for ADO creation |
| **pdf-parse** | — | PDF text extraction |
| **mammoth** | — | Word document parsing |
| **multer** | — | File upload handling |

## Development

```bash
# Terminal 1 — Express server (port 3010)
node server.js

# Terminal 2 — Vite dev server (port 5173, proxies /api to :3010)
cd client && npm run dev
```

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

## Contributing

Contributions are welcome! Please check [open issues](https://github.com/sritajkumarpatel/testforge/issues) before submitting a pull request.

1. Fork the repo
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Verify the server starts: `node server.js`
4. Verify the client builds: `cd client && npm run build`
5. Open a Pull Request

## License

MIT © 2026 Sritaj Kumar Patel

---

<div align="center">
  <p>Built by <a href="https://github.com/sritajkumarpatel">Sritaj Patel</a></p>
  <p>If TestForge saves you time, <strong>star the repo ⭐</strong> — it helps others find it too.</p>
  <p>
    <a href="https://github.com/sritajkumarpatel/testforge/stargazers"><img src="https://img.shields.io/github/stars/sritajkumarpatel/testforge?style=social" alt="Stars"></a>
    <a href="https://github.com/sritajkumarpatel/testforge/forks"><img src="https://img.shields.io/github/forks/sritajkumarpatel/testforge?style=social" alt="Forks"></a>
  </p>
</div>
