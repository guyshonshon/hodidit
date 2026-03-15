# DevOps Solver

> AI-forged solutions for every lab. Step-by-step mastery, on demand.

An intelligent platform that discovers, classifies, and autonomously solves DevOps lab exercises — then delivers them as interactive, syntax-highlighted walkthroughs with a live Python sandbox.

Built for the [DevSecOps-22](https://hothaifa96.github.io/DevSecOps22/) course.

---

## What It Does

On first boot, the backend scrapes the course site, classifies each exercise, and dispatches them to an AI solver. Every solution is cached: solved once, replayed forever. The frontend polls live during solving and renders the result the moment it emerges.

- **Auto-discovery** — scrapes labs and homework directly from the course GitHub repository
- **Exercise classification** — distinguishes normal, dynamic-generation, intentional-error, and ambiguous exercises before solving
- **AI solver** — produces executable, step-by-step solutions with expected output per step
- **Python sandbox** — runs code client-side via Pyodide (WASM); variables are editable, output is live
- **Self-repair loop** — failed Python steps are re-executed and sent back to the AI to self-correct (up to 3 rounds)
- **Walkthrough mode** — animated step-by-step replay with full syntax highlighting
- **GitHub push** — export a solution as a pull request directly from the UI

---

## Stack

| Layer    | Technology |
|----------|------------|
| Backend  | Python · FastAPI · SQLModel · SQLite |
| AI       | OpenAI `gpt-4o` · Google Gemini `gemini-2.5-flash` |
| Frontend | React 18 · TypeScript · Vite · TanStack Query · Framer Motion |
| Infra    | Docker Compose · optional Cloudflare Tunnel |

---

## Getting Started

### 1. Configure

Create a `.env` file at the project root:

```env
# AI — at least one key required
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...

# Provider selection: auto | openai | gemini  (default: auto → OpenAI first)
AI_PROVIDER=auto

# Optional: push solutions to a GitHub repo
GITHUB_TOKEN=ghp_...
GITHUB_REPO=username/repo-name

# Optional: secure the API
API_KEY=your-secret

# Optional: PIN-protect the manual sync button (4 digits)
SYNC_PIN=1234

# Optional: Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=...
```

> **Free tier:** Gemini 2.5 Flash is available at no cost via [Google AI Studio](https://aistudio.google.com). OpenAI requires a paid API account.

### 2. Run

```bash
docker compose up -d
```

Open **http://localhost:3000** — labs are discovered and solved automatically.

**Development mode** (hot-reload on both frontend and backend):

```bash
docker compose -f docker-compose.dev.yml up --build
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`

---

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model |
| `AI_PROVIDER` | `auto` | `auto` · `openai` · `gemini` |
| `API_KEY` | _(none)_ | When set, all API routes require `X-API-Key` header |
| `SYNC_PIN` | _(none)_ | 4-digit PIN required to trigger a manual sync from the UI |
| `MAX_REPAIR_RETRIES` | `3` | Self-repair iterations for failed Python steps |
| `SCRAPE_INTERVAL_MINUTES` | `60` | Scheduler re-scrape interval |
| `DATABASE_URL` | `sqlite:///./devops_solver.db` | SQLite path |
| `CLOUDFLARE_TUNNEL_TOKEN` | _(none)_ | Enables the `tunnel` Compose profile |

---

## Management CLI

```bash
# Inspect all stored solutions
python manage.py list-solutions

# Clear a single solution (triggers re-solve on next startup)
python manage.py clear-solutions --slug linux-labs-1-lab

# Wipe everything and start fresh
python manage.py clear-solutions
```

---

## How Solutions Are Forged

```
Discover labs → Classify exercise type
                      ↓
         requires_generation? → Playwright clicks Generate button
                      ↓
              Send to AI solver → Validate JSON response
                      ↓
           Execute Python steps in sandbox
                      ↓
         Failures? → Self-repair loop (AI corrects, up to 3×)
                      ↓
              Persist solution · Update UI live
```

Once a solution is persisted it is never re-generated — unless explicitly cleared via the CLI.

---

## Project Structure

```
devops-solver/
├── backend/
│   └── app/
│       ├── classifier.py      # Exercise type detection
│       ├── solver.py          # AI solution generation
│       ├── repairer.py        # Self-correction repair loop
│       ├── scraper.py         # Lab discovery & content extraction
│       ├── sandbox.py         # Python execution environment
│       └── routers/labs.py   # API routes & solve pipeline
├── frontend/
│   └── src/
│       ├── pages/             # Dashboard · LabDetail
│       └── components/        # SolutionStepList · PythonSandbox · SolutionFlow
├── manage.py                  # Management CLI
├── docker-compose.yml         # Production
└── docker-compose.dev.yml     # Development (hot-reload)
```

---

*Forged with precision by **Guy Shonshon** · All rights reserved.*
