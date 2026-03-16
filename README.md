# DevOps Solver

> AI-forged DevOps lab solutions, with clean walkthroughs and a live sandbox.

DevOps Solver discovers labs, solves them with AI, and presents them as step-by-step guides you can replay and test.

Built for the [DevSecOps-22](https://hothaifa96.github.io/DevSecOps22/) course.

---

## Highlights

- Automatic lab discovery and classification
- Structured AI-generated solutions with expected outputs
- Interactive walkthrough UI with syntax highlighting
- Browser-based Python sandbox (Pyodide)
- Repair loop for failed Python steps

---

## What It Does

On startup, the backend scans source content, classifies each lab, and sends unsolved items through the solver pipeline. Results are persisted and served to the frontend as guided steps.

- Auto-discovery from source content
- Exercise-type classification before solving
- AI-generated, stepwise responses
- Retry/repair loop for broken Python steps
- Cached solutions for fast repeat access

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, SQLModel, SQLite |
| Frontend | React, TypeScript, Vite |
| AI | OpenAI and Gemini provider support |
| Infra | Docker Compose, EC2, Cloudflare Tunnel |

---

## Local Run

```bash
cp .env.example .env
docker compose up -d
```

For hot-reload development:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Default local endpoints:

- Frontend: `http://localhost:3000` (or `5173` in dev mode)
- Backend API: `http://localhost:8000`

---

## Production Deployment

Production is designed around:

- EC2 as the runtime host
- Cloudflare Tunnel as the public entrypoint
- Docker Compose for service orchestration

Deployment helpers are in `deploy/`.

### Deploy Shell Scripts

- `provision_ec2.sh`  
  Provisions the production EC2 host and baseline networking.

- `ec2-user-data.sh`  
  Bootstraps Docker and host prerequisites on first launch.

- `deploy_on_instance.sh`  
  Runs on the instance to clone/pull the repo and start the stack.

- `update_ec2.sh`  
  One-command remote update flow for pulling latest code and rebuilding services.

### Deployment Flow

1. Provision host (`provision_ec2.sh`)
2. Initial deploy (`deploy_on_instance.sh`)
3. Push to `main` — CI/CD takes over automatically

---

## CI/CD

Every push to `main` triggers `.github/workflows/deploy.yml`:

1. **Build check** — backend lint, frontend build
2. **Deploy** — on success, sends an SSM command to the EC2 instance to pull and rebuild

No SSH or open inbound ports required. Requires `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `EC2_INSTANCE_ID` secrets and `AWS_REGION` variable set in the repository's Actions settings.

---

## Management CLI

```bash
python manage.py list-solutions
python manage.py clear-solutions --slug <slug>
python manage.py clear-solutions
```

---

## Pipeline Overview

```text
Discover labs -> classify -> solve with AI -> validate/repair -> persist -> serve to UI
```

---

## Project Structure

```text
devops-solver/
├── .github/workflows/deploy.yml   # Build check + EC2 deploy on push to main
├── backend/
│   └── app/
│       ├── classifier.py
│       ├── solver.py
│       ├── repairer.py
│       ├── scraper.py
│       ├── sandbox.py
│       └── routers/
├── frontend/
│   └── src/
│       ├── pages/
│       ├── components/
│       └── lib/
├── deploy/
│   ├── provision_ec2.sh
│   ├── ec2-user-data.sh
│   ├── deploy_on_instance.sh
│   └── update_ec2.sh
├── manage.py
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example
```

---

## License

This project is open source and distributed under the repository license. See [LICENSE](LICENSE).

---

## Credits

Created by **Guy Shonshon**.
