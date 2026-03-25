# hoDIDit

[![Build & Deploy](https://github.com/guyshonshon/hodidit/actions/workflows/deploy.yml/badge.svg)](https://github.com/guyshonshon/hodidit/actions/workflows/deploy.yml)
[![Health](https://img.shields.io/website?url=https%3A%2F%2Fdevops.shonshon.com%2Fhealth&up_message=healthy&down_message=down&label=health)](https://devops.shonshon.com/health)
![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/frontend-React-61DAFB?logo=react&logoColor=061a23)
![Docker Compose](https://img.shields.io/badge/runtime-Docker%20Compose-2496ED?logo=docker&logoColor=white)
![AWS SSM](https://img.shields.io/badge/deploy-AWS%20SSM-FF9900?logo=amazonaws&logoColor=white)
![SQLite](https://img.shields.io/badge/storage-SQLite-003B57?logo=sqlite&logoColor=white)
![Python 3.11](https://img.shields.io/badge/python-3.11-3776AB?logo=python&logoColor=white)
![License](https://img.shields.io/github/license/guyshonshon/hodidit)

hoDIDit is an autonomous DevOps lab-solving platform that watches a source GitHub curriculum, detects new exercises, generates structured solutions with AI, validates executable Python steps, and presents the result through an interactive web interface.

Originally built around the idea of "homework that solves itself," the project turns that concept into a production-minded workflow for the [DevSecOps-22](https://hothaifa96.github.io/DevSecOps22/) course.

## Overview

The platform is designed as a continuous pipeline rather than a one-off solver:

- discover content directly from the target GitHub repository
- classify whether a lab is directly solvable, dynamically generated, or ambiguous
- generate a structured solution with an LLM
- execute Python steps in a sandbox and repair failures when needed
- persist clean, replayable results
- serve the solution in a React dashboard with live progress, execution replay, and browser-side sandboxing

This keeps the system useful both as an automation engine and as a learning surface.

## How It Works

1. **Discovery**
   On startup, and then on a recurring scheduler, the backend walks the target repository tree configured by `TARGET_GITHUB_REPO`. Supported content paths are converted into internal `Lab` records automatically, so new labs can appear without manual registration.

2. **Detection of newly added labs**
   When a new file is added to the target GitHub repo, the next sync identifies its path as a new lab slug, stores it in the database, and queues it for background solving.

3. **Classification**
   Before solving, the backend classifies each exercise to decide whether it is a normal lab, content that requires a "Generate" interaction, or something ambiguous enough to skip for manual review.

4. **Dynamic content handling**
   If the source page hides the real task behind a generate action, Playwright opens the page, triggers the generation flow, and extracts the actual content before sending it to the solver.

5. **AI solution generation**
   The solver asks the configured provider, OpenAI or Gemini, to return strict JSON containing summary metadata and a sequence of actionable steps such as shell commands, Git actions, Docker commands, and complete Python scripts.

6. **Verification and repair**
   Python steps are executed in an isolated temporary sandbox. Real stdout and stderr replace guessed output. If execution fails, the repair loop sends the exact failure back to the model and retries until the solution is corrected or the retry budget is exhausted.

7. **Persistence and presentation**
   Final user-facing steps are stored separately from internal repair logs. The frontend then renders the result as an explorable walkthrough, an animated execution replay, and an editable browser sandbox for Python tasks.

8. **Optional publication**
   Solved labs can also be pushed into a GitHub repository as generated solution files and a pull request through the optional GitHub integration.

## Architecture

| Layer | Responsibility | Main Technologies |
| --- | --- | --- |
| Source ingestion | Recursively reads the target course repository, parses markdown/HTML, extracts questions, detects dynamic labs | GitHub API, `httpx`, BeautifulSoup, Playwright |
| Orchestration | Startup seeding, scheduled sync, solve pipeline, API surface, auth | FastAPI, APScheduler |
| Intelligence | Exercise classification, solution generation, repair loop, provider abstraction | OpenAI, Gemini |
| Verification | Executes Python-only steps, captures real output, feeds repair loop | Async subprocess sandbox |
| Persistence | Stores labs, solutions, progress logs, prompts, metadata | SQLModel, SQLite |
| Experience | Dashboard, lab detail view, animated solution replay, in-browser Python sandbox | React, TypeScript, Vite, React Query, Pyodide |
| Runtime | Local dev, container orchestration, remote deployment, health recovery | Docker Compose, EC2, AWS SSM, Cloudflare Tunnel |

## Frontend Experience

The frontend is not just a result viewer.

- The intro route frames the product as the realization of coursework automation, then moves into the main dashboard.
- The dashboard tracks discovered labs, solved coverage, category breakdowns, and live solve progress.
- Each lab page separates source content from the generated solution and exposes replay, reforge, and optional GitHub publishing actions.
- Python steps can be re-run in the browser through Pyodide with editable inputs and variable overrides, while backend-verified outputs remain the canonical record.

## Operational Model

### Docker

The runtime is intentionally compact:

- `backend` runs the API, scheduler, scraper, solver, and sandbox verification flow
- `frontend` serves the built React application through Nginx and proxies `/api` to the backend
- `cloudflared` is optional and exposes the stack without opening inbound ports

The backend container includes a `/health` endpoint and Compose health checks. The frontend waits for the backend to become healthy before starting in both production and development configurations.

### DevOps Lifecycle

The project follows a simple operational loop:

- GitHub Actions runs a build check on every push to `main`
- successful builds deploy to EC2 through AWS SSM, not SSH
- the instance rebuilds and restarts the Compose stack in place
- a runtime guard systemd timer periodically ensures the stack is up and restarts the backend if health degrades
- persistent data lives outside the containers, while Playwright browser binaries are cached in a mounted volume

This keeps the deployment path narrow, auditable, and aligned with a no-open-ports approach.

## Shell Scripts

The `deploy/` directory is the operational control plane for the project.

| Script | Role |
| --- | --- |
| `create_ec2_ssm_role.sh` | Creates the IAM role and instance profile required for SSM-managed instances |
| `provision_ec2.sh` | Provisions a fresh EC2 host for the application |
| `bootstrap.sh` | Performs first-time instance setup, syncs runtime files, builds the stack, and validates health |
| `update_ec2.sh` | Standard deployment entrypoint used by GitHub Actions for ongoing updates |
| `deploy_on_instance.sh` | Instance-side deploy routine for syncing the repository and restarting Compose |
| `install_runtime_guard.sh` | Installs the systemd runtime guard that revives the stack and protects backend health |
| `create_github_deploy_user.sh` | Creates the limited AWS identity used by GitHub Actions deployments |
| `ec2-user-data.sh` | Keeps first-boot EC2 user data intentionally minimal so SSM comes up cleanly |

Taken together, these scripts define the infrastructure lifecycle: provision, bootstrap, update, and recover.

## Local Development

Create an environment file and start the stack:

```bash
cp .env.example .env
docker compose up -d --build
```

For hot-reload development:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Typical local endpoints:

- app: `http://localhost:3000`
- frontend dev server: `http://localhost:5173`
- backend API: `http://localhost:8000`

## Project Shape

```text
.
├── backend/     # FastAPI API, discovery, solving, sandbox, repair, scheduling
├── frontend/    # React UI, execution replay, browser sandbox
├── deploy/      # EC2, SSM, bootstrap, runtime-guard, deploy scripts
├── .github/     # CI/CD workflow
├── manage.py    # Small management CLI for stored solutions
└── docker-compose*.yml
```

## Notes

- Solutions are cache-first: once a lab is solved, stored steps are replayed until a manual reforge is requested.
- Internal attempt history and repair traces are intentionally kept out of user-facing responses.
- API access, sync triggers, and re-solve actions can be protected with shared secrets or PINs depending on the environment.

## License

Distributed under the repository license. See [`LICENSE`](LICENSE).

## Credits

Created by **Guy Shonshon**.

Course content is sourced from the DevSecOps-22 materials by Hothaifa's public course repository, while hoDIDit provides the ingestion, solving, verification, UI, and deployment workflow around it.
