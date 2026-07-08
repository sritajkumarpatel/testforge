<div align="center">

# TestForge ⚒️

### AI-Powered Test Case Generation for Azure DevOps

**Requirements → ADO Test Cases. Three AI agents. One click.**

[![CI](https://img.shields.io/github/actions/workflow/status/sritajkumarpatel/testforge/ci.yml?branch=main&style=flat-square)](https://github.com/sritajkumarpatel/testforge/actions)
[![npm](https://img.shields.io/npm/v/testforge?style=flat-square)](https://www.npmjs.com/package/testforge)
[![GitHub stars](https://img.shields.io/github/stars/sritajkumarpatel/testforge?style=flat-square)](https://github.com/sritajkumarpatel/testforge/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/sritajkumarpatel/testforge?style=flat-square)](https://github.com/sritajkumarpatel/testforge/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)

[Quick Start](#quick-start) · [How It Works](#how-it-works) · [Features](#features) · [Configuration](#configuration) · [API Reference](#api-reference) · [Development & Testing](#development--testing)

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

---

## How It Works

```
Requirements ──> [Requirements Analyst] ──> [Classifier] ──> [UI / API / Mock Designers] ──> [Test Case Writer] ──> ADO Test Cases
```

| Agent | Role | Specialism | Prompt File |
| :--- | :--- | :--- | :--- |
| **Requirements Analyst** | Parses raw input into structured functional requirements | NLP extraction, ambiguity detection, gap analysis | [01-requirements-analyst.md](file:///Users/zenitsu/Documents/GitHub/testforge/agents/01-requirements-analyst.md) |
| **Classifier** | Decides whether the requirement is UI, API, Mock, or mixed | Requirement-type routing | [00-classifier.md](file:///Users/zenitsu/Documents/GitHub/testforge/agents/00-classifier.md) |
| **UI Test Designer** | Designs UI/UX scenarios | Forms, navigation, validation, accessibility, responsive behavior | [02-ui-designer.md](file:///Users/zenitsu/Documents/GitHub/testforge/agents/02-ui-designer.md) |
| **API Test Designer** | Designs API scenarios | HTTP contracts, auth, status codes, schema, rate limits | [02-api-designer.md](file:///Users/zenitsu/Documents/GitHub/testforge/agents/02-api-designer.md) |
| **Mock Designer** | Provides mock/stub guidelines | External dependency simulation, contract testing | [02-mock-designer.md](file:///Users/zenitsu/Documents/GitHub/testforge/agents/02-mock-designer.md) |
| **Test Case Writer** | Produces a JSON array of ADO-ready test case objects | Step-by-step actions, BDD/Gherkin formatting | [03-test-case-writer.md](file:///Users/zenitsu/Documents/GitHub/testforge/agents/03-test-case-writer.md), [03-test-case-writer-bdd.md](file:///Users/zenitsu/Documents/GitHub/testforge/agents/03-test-case-writer-bdd.md) |

Each agent receives the full output of the previous agent, building context sequentially. Supports both **Regular (Standard steps)** and **BDD (Gherkin/Given-When-Then)** test formats.

---

## Features

### Input & Pipeline
* **3 Input Modes**: Upload files (PDF, Word, Markdown, plain text), fetch description from an ADO work item directly, or paste text.
* **Streaming Pipeline**: Watch each agent reason in real time via Server-Sent Events (SSE).
* **Regular + BDD Output**: Select BDD mode to generate test steps formatted in Given-When-Then Gherkin syntax.
* **Run Log Export**: Download execution logs as `.txt` or `.json` for debugging or records.

### Azure DevOps Integration
* **One-Click ADO Creation (CDP)**: Connects to your browser session via Chrome/Edge DevTools Protocol (CDP) — no Personal Access Token (PAT) required. Uses existing active browser authentication context automatically.
* **ADO PAT Support**: Alternatively, specify a PAT (`ADO_PAT`) to run bulk operations headlessly without browser interaction.
* **Bulk Creation**: Test cases are pushed in parallel to Azure DevOps as rich work items, attaching steps, title, and technique tags.

### Enterprise Security & Architecture
* **API Protection**: Optional API authorization wrapper using `AUTH_TOKEN` bearer validation.
* **Rate Limiting**: Built-in protection against API abuse using `express-rate-limit` for both general routes and LLM pipeline runs.
* **State Persistence**: Form input, selected options, settings, and agent console logs survive tab refreshes and accidental navigations.

---

## Quick Start

### Option 1: AI Agent Setup (Recommended)
Open the repo with your AI coding agent (e.g., Claude, Antigravity, or Copilot):
```bash
git clone https://github.com/sritajkumarpatel/testforge.git
cd testforge
opencode .
# then say: "Set up and run TestForge"
```

### Option 2: Manual Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/sritajkumarpatel/testforge.git
   cd testforge
   ```

2. **Install dependencies**:
   Install root server dependencies, then install frontend client dependencies:
   ```bash
   # Install server deps
   npm install
   
   # Install client deps
   cd client && npm install
   cd ..
   ```

3. **Configure environment variables**:
   Create a `.env` file from the example template:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in your keys (e.g., Anthropic Claude, OpenAI, Gemini, or Ollama URL).

4. **Launch the application**:
   * **For Development (Hot-Reloading)**:
     Start the backend server:
     ```bash
     # From root directory
     npm run dev
     ```
     Start the Vite dev server (runs on port `5173` and proxies `/api` to backend):
     ```bash
     # From client directory
     cd client && npm run dev
     ```
     Open your browser to **http://localhost:5173**.
     
   * **For Production (Built Bundle)**:
     Build the React frontend assets and start the integrated Express server:
     ```bash
     # From client directory
     npm run build
     # Return to root directory and start
     cd ..
     npm start
     ```
     Open **http://localhost:3010** in your browser.

---

## Screenshots

Below is a conceptual layout of the TestForge dashboard:

```
┌────────────────────────────────────────────────────────────────────────┐
│  ⚒️ TestForge                     [ Generator ]   [ History ]   [ Settings ]│
├────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────┐ ┌──────────────────────────────────┐ │
│ │ 1. Input Source               │ │ 3. Pipeline Output               │ │
│ │ [ Text ] [ File ] [ ADO WI ]  │ │ ┌──────────────────────────────┐ │ │
│ │ ┌───────────────────────────┐ │ │ │ Classifier: [API] / Mixed      │ │ │
│ │ │ Paste requirement specs   │ │ │ │ Analyst: Gap found on Step 4   │ │ │
│ │ │ ...                       │ │ │ │ Designer: Equivalence Partition│ │ │
│ │ └───────────────────────────┘ │ │ └──────────────────────────────┘ │ │
│ │ [ Run Pipeline ]              │ │ 4. Generated Test Cases          │ │
│ ├───────────────────────────────┤ │ [ Create in ADO ]   [ Export ]   │ │
│ │ 2. Active LLM Configuration   │ │ ┌──────────────────────────────┐ │ │
│ │ Provider: Claude Sonnet 3.5   │ │ │ - TC1: Validate user signup  │ │ │
│ │ Mode:     BDD (Gherkin)       │ │ │ - TC2: Edge-case rate limiting│ │ │
│ └───────────────────────────────┘ └──────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration

TestForge is highly configurable via environment variables in the `.env` file. A central configuration module handles these defaults:

### Server & System Configurations

| Variable | Default | Required For / Description |
| :--- | :--- | :--- |
| `PORT` | `3010` | Port the Express server listens on. |
| `AUTH_TOKEN` | — | Secure all `/api/*` endpoints. Client must supply `Authorization: Bearer <AUTH_TOKEN>`. |
| `LOG_LEVEL` | `info` | Logger severity limit (`trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`). |
| `MAX_JSON_BODY_SIZE`| `2mb` | Maximum JSON request payload size accepted. |
| `MAX_FILE_SIZE` | `10485760` (10MB) | Max size in bytes allowed for document file uploads. |
| `LOGS_DIR` | `logs` | Folder directory relative to root to store persisted JSON audit run logs. |
| `PIPELINE_RATE_LIMIT_MAX` | `10` | Rate limit: maximum orchestrated pipeline executions per minute per IP. |
| `GENERAL_RATE_LIMIT_MAX`  | `60` | Rate limit: maximum overall API requests per minute per IP. |

### AI Pipeline Configuration

| Variable | Default | Description |
| :--- | :--- | :--- |
| `AGENT_TIMEOUT_MS` | `60000` (60s) | Max milliseconds allowed for each agent's LLM generation request. |
| `AGENT_MAX_RETRIES` | `2` | Maximum retry attempts if an LLM invocation fails. |
| `MAX_INPUT_LENGTH` | `50000` | Max character length allowed for raw text requirement input. |
| `MAX_SYSTEM_PROMPT_LENGTH`| `100000` | Max characters permitted for combined system prompts. |

### Azure DevOps & Chrome (CDP) Configurations

| Variable | Default | Description |
| :--- | :--- | :--- |
| `ADO_ORG` | — | Pre-fills Azure DevOps organization name in settings. |
| `ADO_PROJECT` | — | Pre-fills Azure DevOps project name in settings. |
| `ADO_PAT` | — | Azure DevOps Personal Access Token (for programmatic `/api/ado/run-pat` test case push). |
| `CHROME_PATH` | *Auto-detected* | Custom filesystem path to the Chrome/Edge browser binary executable. |
| `CHROME_CDP_PORT` | `9222` | Port to hook into browser session via Chrome DevTools Protocol. |
| `KEEP_CHROME_OPEN` | `false` | Keep debug browser window open after completing the test case push. |
| `ADO_CREATION_DELAY_MS` | `300` | Delay in milliseconds between consecutive work item creation requests (prevents ADO rate issues). |

### LLM Providers Configuration

| Provider | Variable | Default Model | Key / Endpoint Setup |
| :--- | :--- | :--- | :--- |
| **Ollama (Local)** | `OLLAMA_URL` | `llama3.2` | Defaults: URL `http://localhost:11434`, model `llama3.2` |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o` | Get key at [platform.openai.com](https://platform.openai.com) |
| **Anthropic Claude** | `CLAUDE_API_KEY` | `claude-sonnet-4-20250514` | Get key at [console.anthropic.com](https://console.anthropic.com) |
| **Google Gemini** | `GOOGLE_API_KEY` | `gemini-2.0-flash` | Get key at [aistudio.google.com](https://aistudio.google.com) |
| **OpenCode** | `OPENCODE_API_KEY` | `deepseek-v4-flash-free` | API endpoint `https://api.opencode.ai/v1` via `OPENCODE_URL` |

---

## API Reference

TestForge can be operated programmatically. All API endpoints support the optional `Authorization` header if `AUTH_TOKEN` is configured.

### General & Setup Routes
* **`GET /health`** / **`GET /ready`**: System health and writable logs status checks.
* **`GET /api/config`**: Fetches environment config statuses, supported LLM providers, and settings schema.
* **`GET /api/agents`**: Returns a list of active agent prompt personas.

### Pipeline Execution
* **`POST /api/agents/run`**: Begins the orchestrated agent pipeline using SSE.
  * **Payload**:
    ```json
    {
      "input": "User requirements text here",
      "provider": "ollama",
      "providerConfig": { "model": "llama3.2" },
      "mode": "regular"
    }
    ```
* **`GET /api/agents/run/:runId/status`**: Get status/summary details of pipeline output by `runId`.
* **`GET /api/agents/run/:runId/export`**: Export structured run logs as plain text.

### Azure DevOps Actions
* **`POST /api/ado/launch-chrome`**: Launch Chrome in debug mode (port 9222) preloaded to Dev DevOps portal URL.
* **`POST /api/ado/fetch-work-item`**: Connects via CDP to fetch raw text data from an active work item.
  * **Payload**: `{ "org": "myOrg", "project": "myProject", "id": "12345" }`
* **`POST /api/ado/run`**: Publishes test cases using browser CDP session credentials. (SSE stream)
* **`POST /api/ado/run-pat`**: Publishes test cases headlessly using configured server-side `ADO_PAT`. (SSE stream)

### Document Processing
* **`POST /api/parse/document`**: Multi-part upload endpoint to parse text from `.pdf`, `.docx`, `.md`, or `.txt` files.

---

## Development & Testing

### Project Structure

```
testforge/
├── server.js                 # Express server — registers routes & server setup
├── config.js                 # Central config manager (env reading + validation defaults)
├── validators.js             # Zod validation schemas for all incoming API routes
├── types.js                  # Shared type definitions for structures
├── logger.js                 # Pino logger configuration
├── llm-caller.js             # General abstraction for invoking LLM APIs with retries
├── llm-providers.js          # Specific LLM providers adapters & configuration schemas
├── agent-pipeline.js         # Sequential multi-agent pipeline orchestration logic
├── agents/                   # Directory containing Markdown prompts defining agent personas
│   ├── 00-classifier.md
│   ├── 01-requirements-analyst.md
│   ├── 02-ui-designer.md
│   ├── 02-api-designer.md
│   ├── 02-mock-designer.md
│   ├── 03-test-case-writer.md
│   └── 03-test-case-writer-bdd.md
├── client/                   # React frontend application (Vite-powered)
│   ├── src/
│   │   ├── App.jsx           # Entry dashboard page
│   │   ├── components/       # UI tabs, input sources, log, and settings components
│   │   ├── hooks/            # usePipeline hooks for SSE event tracking
│   │   ├── styles/           # Tokens, layout, and component stylesheets
│   │   └── utils/            # Shared formatting helpers
│   ├── public/               # Static assets & public stylesheets
│   └── package.json
├── package.json              # Main workspace scripts and package metadata
└── .env.example
```

### Running Tests

Unit and integration tests are configured for both backend components (using Jest) and frontend client hooks (using Vitest).

#### 1. Backend / Server Tests
Executed using Jest. Includes coverage for endpoints, config parsing, and pipeline orchestration.
```bash
# Run server test suite
npm test

# Run tests in watch mode
npm run test:watch
```

#### 2. Frontend / Client Tests
Executed using Vitest. Verifies rendering hooks and state selectors.
```bash
# From client folder
cd client
npm test

# Run client tests in watch mode
npm run test:watch
```

### Linting & Code Formatting
We use ESLint and Prettier to enforce styling guidelines. Run these checks locally before pushing code:
```bash
# Check code style constraints
npm run lint

# Automatically resolve minor styling/formatting problems
npm run lint:fix
npm run format
```

---

## Contributing

We welcome contributions to TestForge! Before submitting a pull request:
1. Ensure all formatting and lint constraints pass cleanly (`npm run format:check` & `npm run lint`).
2. Make sure both backend and frontend unit test suites pass completely (`npm test` and `cd client && npm test`).
3. Follow the branch naming convention: `feat/amazing-feature` or `fix/critical-bug`.

---

## License

MIT © 2026 Sritaj Kumar Patel

---

<div align="center">
  <p>Built by <a href="https://github.com/sritajkumarpatel">Sritaj Patel</a></p>
  <p>If TestForge saves you time, <strong>star the repo ⭐</strong> — it helps others find it too.</p>
</div>
