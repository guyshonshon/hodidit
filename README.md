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

1. **Build check** — ruff lint on the backend, `npm run build` on the frontend
2. **Deploy** — on success, sends an SSM command to the EC2 instance to pull the latest code and rebuild the Docker stack

No SSH keys or open inbound ports required — deployment runs entirely over AWS SSM.

Authentication uses **AWS OIDC** — no static AWS keys are stored anywhere. GitHub proves its identity to AWS via a short-lived token for each run.

### Required GitHub Secrets / Variables

| Name | Type | Description |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | Secret | ARN of the IAM role GitHub assumes (e.g. `arn:aws:iam::123456789012:role/GitHubDeployRole`) |
| `EC2_INSTANCE_ID` | Secret | Instance ID (e.g. `i-0abc123`) |
| `AWS_REGION` | Variable | Region (e.g. `eu-west-1`) |

Set these under **Settings → Secrets and variables → Actions** in the repository.

### IAM Role Setup (one-time)

1. Add GitHub as an OIDC identity provider in IAM:
   URL: `https://token.actions.githubusercontent.com`
   Audience: `sts.amazonaws.com`

2. Create an IAM role with this trust policy:

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
    "StringLike":  { "token.actions.githubusercontent.com:sub": "repo:<owner>/devops-solver:ref:refs/heads/main" }
  }
}
```

3. Attach a policy with only the permissions needed:

```json
{
  "Effect": "Allow",
  "Action": ["ssm:SendCommand", "ssm:GetCommandInvocation"],
  "Resource": "*"
}
```

The project is intentionally documented without embedding secrets or sensitive values. Keep environment configuration in local `.env` files and out of version control.

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
