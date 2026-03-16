#!/usr/bin/env bash
set -euo pipefail

# One-command remote update over SSM.
#
# Examples:
#   AWS_REGION=eu-west-1 INSTANCE_ID=i-0123456789abcdef0 ./deploy/update_ec2.sh
#   AWS_REGION=eu-west-1 INSTANCE_TAG_NAME=devops-solver-prod ./deploy/update_ec2.sh
#
# Optional env vars:
#   REPO_BRANCH=main
#   APP_DIR=/opt/devops-solver

REGION="${AWS_REGION:-eu-west-1}"
INSTANCE_ID="${INSTANCE_ID:-}"
INSTANCE_TAG_NAME="${INSTANCE_TAG_NAME:-devops-solver-prod}"
REPO_BRANCH="${REPO_BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/devops-solver}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required for deploy/update_ec2.sh." >&2
  exit 1
fi

if [[ -z "${INSTANCE_ID}" ]]; then
  INSTANCE_ID="$(aws ec2 describe-instances \
    --region "${REGION}" \
    --filters "Name=tag:Name,Values=${INSTANCE_TAG_NAME}" "Name=instance-state-name,Values=running" \
    --query 'sort_by(Reservations[].Instances[], &LaunchTime)[-1].InstanceId' \
    --output text)"
fi

if [[ -z "${INSTANCE_ID}" || "${INSTANCE_ID}" == "None" ]]; then
  echo "ERROR: could not resolve a running instance. Set INSTANCE_ID explicitly." >&2
  exit 1
fi

echo "Target instance: ${INSTANCE_ID} (region ${REGION})"
echo "[1/4] Sending update command via SSM..."

REMOTE_CMD="sudo -iu ubuntu bash -lc 'set -euo pipefail; cd ${APP_DIR}; git fetch origin; git checkout ${REPO_BRANCH}; git pull --ff-only origin ${REPO_BRANCH}; if ! docker compose -f docker-compose.prod.yml up -d --build >/tmp/devops-solver-update.log 2>&1; then tail -n 120 /tmp/devops-solver-update.log; exit 1; fi; docker compose -f docker-compose.prod.yml ps; tail -n 40 /tmp/devops-solver-update.log'"
PARAMS_JSON="$(jq -cn --arg c "${REMOTE_CMD}" '{commands:[$c]}')"

COMMAND_ID="$(aws ssm send-command \
  --region "${REGION}" \
  --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript \
  --comment "Update devops-solver on EC2" \
  --parameters "${PARAMS_JSON}" \
  --query 'Command.CommandId' \
  --output text)"

echo "[2/4] Command ID: ${COMMAND_ID}"
echo "[3/4] Waiting for completion..."

STATUS=""
for _ in {1..240}; do
  STATUS="$(aws ssm get-command-invocation \
    --region "${REGION}" \
    --command-id "${COMMAND_ID}" \
    --instance-id "${INSTANCE_ID}" \
    --query 'Status' \
    --output text 2>/dev/null || true)"
  case "${STATUS}" in
    Success|Failed|TimedOut|Cancelled|Undeliverable|Terminated)
      break
      ;;
  esac
  sleep 3
done

echo "[4/4] Fetching command output..."
aws ssm get-command-invocation \
  --region "${REGION}" \
  --command-id "${COMMAND_ID}" \
  --instance-id "${INSTANCE_ID}" \
  --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}' \
  --output json

if [[ "${STATUS}" != "Success" ]]; then
  echo "Update failed with status: ${STATUS}" >&2
  exit 1
fi

echo "Update completed successfully."
