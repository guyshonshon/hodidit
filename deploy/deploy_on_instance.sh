#!/usr/bin/env bash
set -euo pipefail

# Run this ON the EC2 instance (via SSM session as root or ubuntu).
#
# Optional env vars:
#   REPO_URL=https://github.com/<you>/hodidit.git   # required only for first clone
#   REPO_BRANCH=main

APP_DIR="${APP_DIR:-/opt/hodidit}"
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
  # The instance checkout is disposable. Keep only local runtime files
  # and force the repo itself to match origin on every deploy.
  git fetch --prune origin
  git checkout -f "${REPO_BRANCH}"
  git reset --hard "origin/${REPO_BRANCH}"
  git clean -fd \
    -e .env \
    -e docker-compose.prod.yml \
    -e data/
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
  echo "Edit ${APP_DIR}/.env before starting stack."
  exit 0
fi

docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

if [[ -x deploy/install_runtime_guard.sh ]]; then
  APP_DIR="${APP_DIR}" deploy/install_runtime_guard.sh
fi

docker compose -f docker-compose.prod.yml ps
