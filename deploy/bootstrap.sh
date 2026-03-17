#!/usr/bin/env bash
# One-time instance setup: installs Docker, clones repo, writes .env, starts stack.
# Run from your local machine after the EC2 instance is launched.
#
# Prerequisites:
#   - EC2 instance with SSM instance profile (AmazonSSMManagedInstanceCore)
#   - .env file with your app secrets in the current directory
#   - jq and AWS CLI installed locally
#
# Usage:
#   AWS_REGION=eu-west-1 \
#   INSTANCE_ID=i-0123456789abcdef0 \
#   REPO_URL=https://github.com/you/repo.git \
#   ./deploy/bootstrap.sh
set -euo pipefail

REGION="${AWS_REGION:-eu-west-1}"
INSTANCE_ID="${INSTANCE_ID:?Set INSTANCE_ID}"
REPO_URL="${REPO_URL:?Set REPO_URL (e.g. https://github.com/org/repo.git)}"
REPO_BRANCH="${REPO_BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/hodidit}"
ENV_FILE="${ENV_FILE:-.env}"
PROD_COMPOSE_FILE="${PROD_COMPOSE_FILE:-docker-compose.prod.yml}"
DEPLOY_LOCK_FILE="${APP_DIR}/.deploy.lock"

[[ -f "$ENV_FILE" ]] || { echo "ERROR: $ENV_FILE not found." >&2; exit 1; }
[[ -f "$PROD_COMPOSE_FILE" ]] || { echo "ERROR: $PROD_COMPOSE_FILE not found." >&2; exit 1; }
command -v jq >/dev/null    || { echo "ERROR: jq is required." >&2; exit 1; }

ENV_B64=$(base64 < "$ENV_FILE" | tr -d '\n')
PROD_COMPOSE_B64=$(base64 < "$PROD_COMPOSE_FILE" | tr -d '\n')

aws_with_retry() {
  local attempt=1
  local max_attempts="${AWS_MAX_ATTEMPTS:-5}"
  local delay="${AWS_RETRY_DELAY_SECONDS:-3}"
  local output exit_code

  while true; do
    if output=$("$@" 2>&1); then
      printf '%s' "$output"
      return 0
    fi

    exit_code=$?
    if [[ $attempt -ge $max_attempts ]]; then
      printf '%s\n' "$output" >&2
      return "$exit_code"
    fi

    printf 'WARN: AWS command failed (attempt %d/%d): %s\n' \
      "$attempt" "$max_attempts" "$(printf '%s' "$output" | head -n 1)" >&2
    attempt=$((attempt + 1))
    sleep "$delay"
  done
}

run_ssm_step() {
  local label="$1"
  local remote_script="$2"
  local command_id status elapsed

  echo
  echo "==> ${label}"
  command_id=$(aws_with_retry aws ssm send-command \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --comment "$label" \
    --parameters "$(jq -cn --arg cmd "$remote_script" '{commands:[$cmd]}')" \
    --query 'Command.CommandId' \
    --output text)

  echo "Command ID: $command_id"
  elapsed=0
  while true; do
    status=$(aws_with_retry aws ssm get-command-invocation \
      --region "$REGION" \
      --command-id "$command_id" \
      --instance-id "$INSTANCE_ID" \
      --query 'Status' \
      --output text || true)
    case "$status" in
      Success|Failed|TimedOut|Cancelled|Undeliverable|Terminated)
        break
        ;;
    esac
    elapsed=$((elapsed + 5))
    printf "\r[%ds] %-32s %s" "$elapsed" "$label" "${status:-pending}"
    sleep 5
    [[ $elapsed -ge 1800 ]] && {
      echo
      echo "ERROR: ${label} timed out after 30 min" >&2
      exit 1
    }
  done
  echo

  aws_with_retry aws ssm get-command-invocation \
    --region "$REGION" \
    --command-id "$command_id" \
    --instance-id "$INSTANCE_ID" \
    --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}' \
    --output json

  [[ "$status" == "Success" ]] || {
    echo "ERROR: ${label} failed with status ${status}" >&2
    exit 1
  }
}

# Wait for SSM
echo "Waiting for SSM on $INSTANCE_ID..."
PING=""
CONNECTION_LOST_COUNT=0
for i in {1..60}; do
  PING=$(aws_with_retry aws ssm describe-instance-information \
    --region "$REGION" \
    --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text || true)
  [[ "$PING" == "None" || "$PING" == "[]" ]] && PING=""
  printf "\r[wait %02d/60] PingStatus: %-14s" "$i" "${PING:-missing}"
  if [[ "$PING" == "Online" ]]; then
    break
  fi
  if [[ "$PING" == "ConnectionLost" ]]; then
    CONNECTION_LOST_COUNT=$((CONNECTION_LOST_COUNT + 1))
    if [[ $CONNECTION_LOST_COUNT -ge 3 ]]; then
      echo
      echo "ERROR: SSM reached ConnectionLost for $INSTANCE_ID."
      echo "This usually means the instance bootstrapped into a broken SSM state."
      echo "Reprovision with the current minimal deploy/ec2-user-data.sh and rerun bootstrap.sh."
      exit 1
    fi
  else
    CONNECTION_LOST_COUNT=0
  fi
  sleep 5
done
echo
[[ "$PING" == "Online" ]] || { echo "ERROR: SSM not online for $INSTANCE_ID" >&2; exit 1; }

# Phase 1: install Docker and add swap before the build so the host stays responsive.
PHASE1=$(cat <<SCRIPT
[ -n "\$BASH_VERSION" ] || exec /bin/bash "\$0" "\$@"
set -euo pipefail
export HOME=/root DEBIAN_FRONTEND=noninteractive

# Add swap once; this helps Docker builds on small EC2 instances.
if ! swapon --show | grep -q '^/swapfile '; then
  if command -v fallocate >/dev/null 2>&1; then
    fallocate -l 2G /swapfile
  else
    dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
  fi
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap enabled."
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get update -q
  apt-get install -y --no-install-recommends ca-certificates curl git
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  echo "Docker installed."
fi
SCRIPT
)

# Phase 2: sync repo + local-only runtime files.
PHASE2=$(cat <<SCRIPT
[ -n "\$BASH_VERSION" ] || exec /bin/bash "\$0" "\$@"
set -euo pipefail
export HOME=/root

git config --global --add safe.directory ${APP_DIR} 2>/dev/null || true
if [[ ! -d ${APP_DIR}/.git ]]; then
  git clone --branch ${REPO_BRANCH} ${REPO_URL} ${APP_DIR}
else
  git -C ${APP_DIR} fetch origin
  git -C ${APP_DIR} checkout ${REPO_BRANCH}
  git -C ${APP_DIR} pull --ff-only origin ${REPO_BRANCH}
fi

printf '%s' '${ENV_B64}' | base64 -d > ${APP_DIR}/.env
chmod 600 ${APP_DIR}/.env
echo ".env written."

# Write local-only production compose file
printf '%s' '${PROD_COMPOSE_B64}' | base64 -d > ${APP_DIR}/docker-compose.prod.yml
chmod 644 ${APP_DIR}/docker-compose.prod.yml
echo "docker-compose.prod.yml written."
SCRIPT
)

# Phase 3: build + start the stack.
PHASE3=$(cat <<SCRIPT
[ -n "\$BASH_VERSION" ] || exec /bin/bash "\$0" "\$@"
set -euo pipefail

cd ${APP_DIR}
trap 'rm -f ${DEPLOY_LOCK_FILE}' EXIT
: > ${DEPLOY_LOCK_FILE}
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --remove-orphans
if [[ -x deploy/install_runtime_guard.sh ]]; then
  APP_DIR=${APP_DIR} ./deploy/install_runtime_guard.sh
fi
docker compose -f docker-compose.prod.yml ps
docker exec hodidit-backend curl -fsS http://localhost:8000/health
echo "Backend healthy!"
SCRIPT
)

run_ssm_step "Install Docker and swap" "$PHASE1"
run_ssm_step "Sync repo and prod files" "$PHASE2"
run_ssm_step "Build and start stack" "$PHASE3"
echo "Bootstrap complete."
