# hoDIDit

[![Build & Deploy](https://github.com/guyshonshon/hodidit/actions/workflows/deploy.yml/badge.svg)](https://github.com/guyshonshon/hodidit/actions/workflows/deploy.yml)

> AI-forged DevOps lab solutions, with clean walkthroughs and a live sandbox.

Hodidit discovers labs, solves them with AI, and presents them as step-by-step guides you can replay and test.

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


---

## Production Deployment

Production is designed around:

- EC2 as the runtime host
- SSM as the only control/deploy path
- Cloudflare Tunnel as the public entrypoint
- Docker Compose for service orchestration

Deployment helpers are in `deploy/`.

### Which Shell Script Does What

These are not all meant to be run every time.

- `create_ec2_ssm_role.sh`
  One-time AWS setup. Creates the EC2 IAM role and instance profile so the machine can register with SSM.

- `provision_ec2.sh`
  Create a fresh EC2 instance. This is the script to use when replacing the server.

- `bootstrap.sh`
  First deploy only. Run this from your laptop after the instance is online in SSM. It installs Docker on the host, clones the repo, copies your local `.env`, copies your local-only `docker-compose.prod.yml`, and starts the stack.

- `update_ec2.sh`
  Normal deploy path after the server already exists. This is what GitHub Actions runs on pushes to `main`.

- `deploy_on_instance.sh`
  The actual remote deploy script that runs on the EC2 host. `update_ec2.sh` calls this over SSM. You generally do not run this directly from your laptop.

- `install_runtime_guard.sh`
  Installs a small systemd timer on the instance so the Compose stack comes back after reboot and the backend is restarted if it becomes unhealthy.

- `create_github_deploy_user.sh`
  One-time GitHub Actions credential setup. Creates the minimal IAM user/policy used by the workflow.

- `ec2-user-data.sh`
  Very small first-boot script for EC2. It intentionally does almost nothing so SSM comes up cleanly.

### Practical Deploy Procedure

There are only three real phases:

1. One-time AWS setup
2. First deploy to a fresh server
3. Normal ongoing deploys

### 1. One-Time AWS Setup

Create the EC2 SSM role/profile:

```bash
AWS_REGION=eu-west-1 \
EC2_ROLE_NAME=hodidit-ec2-ssm-role \
INSTANCE_PROFILE_NAME=hodidit-ec2-profile \
./deploy/create_ec2_ssm_role.sh
```

Create the GitHub Actions deploy user and access key:

```bash
AWS_REGION=eu-west-1 \
GITHUB_DEPLOY_USER_NAME=hodidit-gh-deploy \
CREATE_ACCESS_KEY=1 \
./deploy/create_github_deploy_user.sh
```

Put the returned values into GitHub repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Also set this GitHub repository variable:

- `AWS_REGION=eu-west-1`

### 2. First Deploy To A Fresh Server

Provision the machine:

```bash
AWS_REGION=eu-west-1 \
INSTANCE_PROFILE_NAME=hodidit-ec2-profile \
INSTANCE_TAG_NAME=hodidit-prod \
./deploy/provision_ec2.sh
```

By default this provisions an Ubuntu 24.04 ARM `t4g.micro` with a `20 GB` root disk and no inbound ports.

Then run the first deploy from your laptop:

```bash
AWS_REGION=eu-west-1 \
INSTANCE_ID=<new-instance-id> \
REPO_URL=https://github.com/<you>/hodidit.git \
./deploy/bootstrap.sh
```

What `bootstrap.sh` does:

- waits for SSM to become usable
- installs Docker and Docker Compose on the instance
- clones the repo into `/opt/hodidit`
- copies your local `.env` to `/opt/hodidit/.env`
- copies your local-only `docker-compose.prod.yml` to `/opt/hodidit/docker-compose.prod.yml`
- runs `docker compose up -d --build`
- installs the runtime guard

Important:

- `.env` is expected to exist locally before you run `bootstrap.sh`
- `docker-compose.prod.yml` is intentionally local-only and not committed; `bootstrap.sh` copies it to the server for the first deploy
- after this first deploy, the server already has both files, so regular deploys do not need them copied again

After bootstrap succeeds, set this GitHub secret:

- `EC2_INSTANCE_ID=<new-instance-id>`

### 3. Normal Ongoing Deploys

Once the server is initialized, deploys are simple:

- push to `main`
- GitHub Actions runs `.github/workflows/deploy.yml`
- the workflow calls `deploy/update_ec2.sh`
- `update_ec2.sh` sends an SSM command to the instance
- on the instance, `deploy/deploy_on_instance.sh` does `git fetch`, `git checkout`, `git pull`, and `docker compose up -d --build`

You only need `bootstrap.sh` again when replacing the EC2 instance or rebuilding from scratch.

---

## CI/CD

Every push to `main` triggers `.github/workflows/deploy.yml`:

1. **Build check** — backend lint, frontend build
2. **Deploy** — on success, runs `deploy/update_ec2.sh`, which waits for SSM, sends the remote deploy command, and prints the SSM result

No SSH or open inbound ports are required. GitHub Actions needs:

- Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `EC2_INSTANCE_ID`
- Variable: `AWS_REGION` (defaults to `eu-west-1` if omitted)

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
hodidit/
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
│   ├── create_ec2_ssm_role.sh
│   ├── create_github_deploy_user.sh
│   ├── provision_ec2.sh
│   ├── ec2-user-data.sh
│   ├── deploy_on_instance.sh
│   ├── bootstrap.sh
│   ├── install_runtime_guard.sh
│   └── update_ec2.sh
├── manage.py
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example
```

---

## License

This project is read-only, with backend and ci/cd open source and distributed under the repository license. See [LICENSE](LICENSE).

---

## Credits

Created by **Guy Shonshon**.
