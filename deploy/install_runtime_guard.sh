#!/usr/bin/env bash
set -euo pipefail

# Installs a systemd timer that auto-heals the production compose stack:
# - Runs shortly after boot (so app comes back after EC2 restart)
# - Re-runs every minute to recover stopped/unhealthy services

APP_DIR="${APP_DIR:-/opt/devops-solver}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-devops-solver-backend}"

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

${SUDO} tee /usr/local/bin/devops-solver-runtime-guard.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/devops-solver}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-devops-solver-backend}"

if [[ ! -d "${APP_DIR}" ]]; then
  exit 0
fi

cd "${APP_DIR}"

if [[ ! -f "${COMPOSE_FILE}" || ! -f ".env" ]]; then
  exit 0
fi

# Idempotent: creates missing containers and starts stopped ones.
/usr/bin/docker compose -f "${COMPOSE_FILE}" up -d >/dev/null 2>&1 || true

# If backend exists but reports unhealthy, restart backend service.
if /usr/bin/docker container inspect "${BACKEND_CONTAINER}" >/dev/null 2>&1; then
  HEALTH_STATUS=$(/usr/bin/docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${BACKEND_CONTAINER}" 2>/dev/null || echo "missing")
  if [[ "${HEALTH_STATUS}" != "healthy" ]]; then
    /usr/bin/docker compose -f "${COMPOSE_FILE}" restart backend >/dev/null 2>&1 || true
  fi
fi
EOF

${SUDO} chmod +x /usr/local/bin/devops-solver-runtime-guard.sh

${SUDO} tee /etc/systemd/system/devops-solver-runtime-guard.service >/dev/null <<EOF
[Unit]
Description=DevOps Solver Runtime Guard
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Type=oneshot
Environment=APP_DIR=${APP_DIR}
Environment=COMPOSE_FILE=${COMPOSE_FILE}
Environment=BACKEND_CONTAINER=${BACKEND_CONTAINER}
ExecStart=/usr/local/bin/devops-solver-runtime-guard.sh
EOF

${SUDO} tee /etc/systemd/system/devops-solver-runtime-guard.timer >/dev/null <<'EOF'
[Unit]
Description=Run DevOps Solver Runtime Guard regularly

[Timer]
OnBootSec=45s
OnUnitActiveSec=1min
Persistent=true

[Install]
WantedBy=timers.target
EOF

${SUDO} systemctl daemon-reload
${SUDO} systemctl enable --now devops-solver-runtime-guard.timer
${SUDO} systemctl start devops-solver-runtime-guard.service

echo "Runtime guard installed and active."
