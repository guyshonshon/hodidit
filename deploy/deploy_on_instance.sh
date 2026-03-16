#!/usr/bin/env bash
set -euo pipefail

# Run this ON the EC2 instance (via SSM session as ubuntu/root).
#
# Optional env vars:
#   REPO_URL=https://github.com/<you>/devops-solver.git   # required only for first clone
#   REPO_BRANCH=main

APP_DIR="${APP_DIR:-/opt/devops-solver}"
REPO_URL="${REPO_URL:-}"
REPO_BRANCH="${REPO_BRANCH:-main}"

mkdir -p "${APP_DIR}"
cd "${APP_DIR}"

if [[ ! -d .git ]]; then
  if [[ -z "${REPO_URL}" ]]; then
    echo "ERROR: REPO_URL is required for first deploy (repo not cloned yet)." >&2
    exit 1
  fi
  git clone --branch "${REPO_BRANCH}" "${REPO_URL}" .
else
  git fetch origin
  git checkout "${REPO_BRANCH}"
  git pull --ff-only origin "${REPO_BRANCH}"
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
  echo "Edit /opt/devops-solver/.env before starting stack."
  exit 0
fi

docker compose -f docker-compose.prod.yml up -d --build

if [[ -x deploy/install_runtime_guard.sh ]]; then
  deploy/install_runtime_guard.sh
fi

docker compose -f docker-compose.prod.yml ps
