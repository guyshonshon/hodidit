#!/usr/bin/env bash
# Deploy: git pull + docker rebuild on EC2 via SSM.
# Called by GitHub Actions on every push to main.
set -euo pipefail

REGION="${AWS_REGION:-eu-west-1}"
INSTANCE_ID="${INSTANCE_ID:?Set EC2_INSTANCE_ID in GitHub secrets}"
REPO_BRANCH="${REPO_BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/hodidit}"
DEPLOY_LOCK_FILE="${APP_DIR}/.deploy.lock"

REGION="$(printf '%s' "${REGION}" | tr -d '[:space:]')"
INSTANCE_ID="$(printf '%s' "${INSTANCE_ID}" | tr -d '[:space:]')"

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

get_ssm_ping_status() {
  aws_with_retry aws ssm describe-instance-information \
    --region "$REGION" \
    --query "InstanceInformationList[?InstanceId=='${INSTANCE_ID}'] | [0].PingStatus" \
    --output text || true
}

get_ec2_state() {
  aws_with_retry aws ec2 describe-instances \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].State.Name' \
    --output text || true
}

probe_ssm_run_command() {
  local probe_id probe_status

  probe_id="$(aws_with_retry aws ssm send-command \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --comment "SSM probe from update_ec2.sh" \
    --parameters '{"commands":["echo ssm-ok"]}' \
    --query 'Command.CommandId' \
    --output text || true)"

  [[ -n "$probe_id" && "$probe_id" != "None" ]] || return 1

  for _ in {1..12}; do
    probe_status="$(aws_with_retry aws ssm get-command-invocation \
      --region "$REGION" \
      --command-id "$probe_id" \
      --instance-id "$INSTANCE_ID" \
      --query 'Status' \
      --output text || true)"
    case "$probe_status" in
      Success)
        return 0
        ;;
      Failed|TimedOut|Cancelled|Undeliverable|Terminated)
        return 1
        ;;
    esac
    sleep 5
  done

  return 1
}

# Wait for SSM agent
echo "Waiting for SSM on $INSTANCE_ID..."
PING=""
EC2_STATE=""
for i in {1..60}; do
  PING="$(get_ssm_ping_status)"
  [[ "$PING" == "None" || "$PING" == "[]" ]] && PING=""
  if (( i == 1 || i % 6 == 0 )); then
    EC2_STATE="$(get_ec2_state)"
  fi
  printf "\r[wait %02d/60] EC2: %-10s SSM: %-14s" "$i" "${EC2_STATE:-unknown}" "${PING:-missing}"
  [[ "$PING" == "Online" ]] && break
  sleep 5
done
echo

if [[ "$PING" != "Online" ]]; then
  echo "SSM did not report Online via describe-instance-information. Trying direct RunCommand probe..."
  if probe_ssm_run_command; then
    echo "Direct SSM probe succeeded. Continuing with deploy."
  else
    EC2_STATE="$(get_ec2_state)"
    echo "ERROR: SSM not online for $INSTANCE_ID" >&2
    echo "  REGION=${REGION}" >&2
    echo "  INSTANCE_ID=${INSTANCE_ID}" >&2
    echo "  EC2_STATE=${EC2_STATE:-unknown}" >&2
    echo "Check that the GitHub secret EC2_INSTANCE_ID matches the current instance and that the region is correct." >&2
    exit 1
  fi
fi

# Build remote script (variables expanded locally before sending).
# Keep the deploy logic inline so a stale copy on the instance cannot block updates.
REMOTE=$(cat <<SCRIPT
[ -n "\$BASH_VERSION" ] || exec /bin/bash "\$0" "\$@"
export HOME=/root
git config --global --add safe.directory ${APP_DIR} 2>/dev/null || true
mkdir -p ${APP_DIR}
cd ${APP_DIR}

if [[ ! -d .git ]]; then
  echo "ERROR: ${APP_DIR} is not a git checkout. Run deploy/bootstrap.sh first." >&2
  exit 1
fi

git fetch --prune origin
git checkout -f ${REPO_BRANCH}
git reset --hard origin/${REPO_BRANCH}
git clean -fd \
  -e .env \
  -e docker-compose.prod.yml \
  -e data/

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
  echo "Edit ${APP_DIR}/.env before starting stack."
  exit 0
fi

trap 'rm -f ${DEPLOY_LOCK_FILE}' EXIT
: > ${DEPLOY_LOCK_FILE}

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --remove-orphans

if [[ -x deploy/install_runtime_guard.sh ]]; then
  APP_DIR=${APP_DIR} ./deploy/install_runtime_guard.sh
fi

docker compose -f docker-compose.prod.yml ps
SCRIPT
)

echo "Sending deploy command..."
COMMAND_ID=$(aws_with_retry aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters "$(jq -cn --arg cmd "$REMOTE" '{commands:[$cmd]}')" \
  --query 'Command.CommandId' \
  --output text)

echo "Command ID: $COMMAND_ID"
STATUS=""
i=0
while true; do
  STATUS=$(aws_with_retry aws ssm get-command-invocation \
    --region "$REGION" --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query 'Status' --output text || true)
  case "$STATUS" in
    Success|Failed|TimedOut|Cancelled|Undeliverable|Terminated) break ;;
  esac
  i=$((i+1))
  elapsed=$((i*5))
  printf "\r[%ds] Status: %-20s" "$elapsed" "${STATUS:-pending}"
  sleep 5
  [[ $i -ge 300 ]] && { echo; echo "ERROR: Timed out after 25 min" >&2; exit 1; }
done
echo  # newline after progress line

aws_with_retry aws ssm get-command-invocation \
  --region "$REGION" --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
  --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}' \
  --output json

[[ "$STATUS" == "Success" ]] || { echo "ERROR: Deploy failed: $STATUS" >&2; exit 1; }
echo "Deploy complete."
