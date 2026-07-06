# TestForge

**AI-powered test case generation for Azure DevOps.** Feed it requirements documents, ADO work items, or plain text — three autonomous AI agents analyze, design, and produce ready-to-create test cases.

---

## How It Works

```
Requirements → [Requirements Analyst] → [Test Designer] → [Test Case Writer] → ADO Test Cases
```

| Agent | Role |
|-------|------|
| **Requirements Analyst** | Parses raw input into structured functional requirements |
| **Test Designer** | Applies 8 test design techniques (equivalence partitioning, boundary value analysis, state transition, etc.) |
| **Test Case Writer** | Produces a JSON array of ADO-ready test case objects |

Each agent receives the full output of the previous agent, building context sequentially.

---

## Features

- **3 input modes**: Upload files (PDF, Word, Markdown, code), fetch ADO work items, or paste text directly
- **5 LLM providers**: Ollama (local), OpenAI, Anthropic Claude, Google Gemini, OpenCode
- **Streaming output**: See each agent's reasoning in real time via SSE
- **JSON import/export**: Download generated test cases, edit externally, re-upload
- **One-click ADO creation**: Launches Chrome, uses your browser session (no PAT needed) to create test case work items
- **Works offline**: Use Ollama with local models, no internet required

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- npm
- (Optional) Chrome/Edge for ADO creation
- (Optional) Ollama for local LLM inference

### 2. Install

```bash
git clone <repo-url>
cd testforge
npm install
cd client && npm install && cd ..
```

### 3. Configure

Copy `.env.example` to `.env` and set at least one LLM provider:

```env
# Minimum — local (Ollama)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Or — cloud providers
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
OPENCODE_API_KEY=oc-...
```

### 4. Run

```bash
node server.js
```

Open `http://localhost:3010` in your browser.

---

## Configuration Reference

| Variable | Default | Provider |
|----------|---------|----------|
| `PORT` | `3010` | — |
| `ADO_ORG` | — | Pre-fills Organisation in Settings |
| `ADO_PROJECT` | — | Pre-fills Project in Settings |
| `CHROME_PATH` | Auto-detected | Chrome/Edge location |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama |
| `OLLAMA_MODEL` | `llama3.2` | Ollama |
| `OPENAI_API_KEY` | — | OpenAI |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI |
| `CLAUDE_API_KEY` | — | Anthropic |
| `CLAUDE_MODEL` | `claude-sonnet-4-20250514` | Anthropic |
| `GOOGLE_API_KEY` | — | Google Gemini |
| `GOOGLE_MODEL` | `gemini-2.0-flash` | Google Gemini |
| `OPENCODE_API_KEY` | — | OpenCode |
| `OPENCODE_URL` | `https://api.opencode.ai/v1` | OpenCode |
| `OPENCODE_MODEL` | `deepseek-v4-flash-free` | OpenCode |

---

## Usage Walkthrough

### Step 1: Load Requirements (Pipeline tab)

Choose one of three input methods:

- **Upload File**: Drop or select PDF, .docx, .txt, .md, or code files. The server parses them and extracts the text.
- **Azure DevOps**: Enter a work item ID (PBI, user story, bug) to fetch its description directly from ADO. Requires Organisation and Project set in Settings.
- **Paste Text**: Copy-paste requirements, specifications, or user stories directly.

Click **Run Agents** to start the pipeline.

### Step 2: Agent Pipeline

The three agents run sequentially. A live log shows:
- Which agent is currently reasoning
- Streaming text previews as each agent generates output
- Completion status for each stage

When all agents finish, the generated test case JSON is automatically parsed and validated.

### Step 3: Review & Export

- Edit the JSON directly in the editor
- Click **Parse & Validate** to check structure
- **Download JSON** to save and edit externally
- **Upload JSON** to re-import previously downloaded test cases

### Step 4: Create in Azure DevOps (optional)

1. Launch Chrome from the **Create in Azure DevOps** card
2. Sign into your ADO instance in the opened browser
3. Click **Create in Azure DevOps**

The tool uses Playwright CDP to hijack your authenticated session — no PAT or API key needed. Progress streams live as each test case is created.

---

## LLM Providers

### Ollama (Local)
Free, runs entirely on your machine. No API key needed.

```bash
ollama pull llama3.2
```

### OpenAI
Set `OPENAI_API_KEY` in `.env` or enter it in Settings. Supports GPT-4o, GPT-4o-mini, GPT-4, GPT-3.5-turbo, and o3-mini.

### Claude (Anthropic)
Set `CLAUDE_API_KEY` in `.env` or enter it in Settings. Known for strong reasoning — good for complex test design.

### Google Gemini
Set `GOOGLE_API_KEY` in `.env` or Settings. Fast and capable, with a generous free tier.

### OpenCode
Set `OPENCODE_API_KEY` in `.env` or Settings. Connects to the OpenCode API for model routing.

Each provider can be configured per-session in the Settings tab without modifying `.env`.

---

## Project Structure

```
testforge/
├── server.js               # Express server — all API routes
├── llm-providers.js        # Provider abstraction (Ollama, OpenAI, Claude, Google, OpenCode)
├── agent-pipeline.js       # 3-agent sequential orchestration
├── agents/                 # Agent persona prompts (Markdown)
│   ├── 01-requirements-analyst.md
│   ├── 02-test-designer.md
│   └── 03-test-case-writer.md
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/     # Pipeline, InputSource, AgentResults, SettingsTab, etc.
│   │   └── index.css
│   ├── public/
│   └── package.json
├── public/                 # Legacy fallback (served when client/dist/ is absent)
├── .env.example            # All environment variables documented
└── package.json
```

---

## Development

```bash
# Run Vite dev server (hot reload on :5173, proxies /api to :3010)
cd client && npm run dev

# In another terminal, run Express server
node server.js
```

The Vite dev server proxies `/api/*` requests to Express on port 3010, so all API calls work seamlessly during development.

---

## Tech Stack

- **Backend**: Node.js, Express, Playwright (CDP), multer
- **Frontend**: React 18, Vite 6, vanilla CSS
- **Parsing**: pdf-parse (PDF), mammoth (Word)
- **LLM APIs**: Ollama, OpenAI, Anthropic Claude, Google Gemini, OpenCode

---

MIT © 2026 Sritaj Kumar Patel
