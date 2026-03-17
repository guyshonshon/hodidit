#!/usr/bin/env bash
set -euo pipefail

# Installs a systemd timer that keeps the production compose stack alive after boot.

APP_DIR="${APP_DIR:-/opt/hodidit}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-hodidit-backend}"
SERVICE_PREFIX="hodidit-runtime-guard"
LEGACY_SERVICE_PREFIX="devops-solver-runtime-guard"

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

${SUDO} tee /usr/local/bin/${SERVICE_PREFIX}.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/hodidit}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-hodidit-backend}"

if [[ ! -d "${APP_DIR}" ]]; then
  exit 0
fi

cd "${APP_DIR}"

if [[ ! -f "${COMPOSE_FILE}" || ! -f ".env" ]]; then
  exit 0
fi

/usr/bin/docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans >/dev/null 2>&1 || true

if /usr/bin/docker container inspect "${BACKEND_CONTAINER}" >/dev/null 2>&1; then
  HEALTH_STATUS=$(/usr/bin/docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${BACKEND_CONTAINER}" 2>/dev/null || echo "missing")
  if [[ "${HEALTH_STATUS}" != "healthy" ]]; then
    /usr/bin/docker compose -f "${COMPOSE_FILE}" restart backend >/dev/null 2>&1 || true
  fi
fi
EOF

${SUDO} chmod +x /usr/local/bin/${SERVICE_PREFIX}.sh

${SUDO} tee /etc/systemd/system/${SERVICE_PREFIX}.service >/dev/null <<EOF
[Unit]
Description=hodidit runtime guard
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Type=oneshot
Environment=APP_DIR=${APP_DIR}
Environment=COMPOSE_FILE=${COMPOSE_FILE}
Environment=BACKEND_CONTAINER=${BACKEND_CONTAINER}
ExecStart=/usr/local/bin/${SERVICE_PREFIX}.sh
EOF

${SUDO} tee /etc/systemd/system/${SERVICE_PREFIX}.timer >/dev/null <<'EOF'
[Unit]
Description=Run hodidit runtime guard regularly

[Timer]
OnBootSec=45s
OnUnitActiveSec=1min
Persistent=true

[Install]
WantedBy=timers.target
EOF

${SUDO} systemctl disable --now ${LEGACY_SERVICE_PREFIX}.timer >/dev/null 2>&1 || true
${SUDO} systemctl stop ${LEGACY_SERVICE_PREFIX}.service >/dev/null 2>&1 || true
${SUDO} rm -f \
  /usr/local/bin/${LEGACY_SERVICE_PREFIX}.sh \
  /etc/systemd/system/${LEGACY_SERVICE_PREFIX}.service \
  /etc/systemd/system/${LEGACY_SERVICE_PREFIX}.timer

${SUDO} systemctl daemon-reload
${SUDO} systemctl enable --now ${SERVICE_PREFIX}.timer
${SUDO} systemctl start ${SERVICE_PREFIX}.service

echo "Runtime guard installed and active."
