#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   AWS_REGION=eu-west-1 INSTANCE_PROFILE_NAME=EC2SSMInstanceProfile ./deploy/provision_ec2.sh

REGION="${AWS_REGION:-eu-west-1}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.small}"
INSTANCE_PROFILE_NAME="${INSTANCE_PROFILE_NAME:-}"
SG_NAME="${SECURITY_GROUP_NAME:-devops-solver-sg}"
TAG_NAME="${INSTANCE_TAG_NAME:-devops-solver-prod}"

if [[ -z "${INSTANCE_PROFILE_NAME}" ]]; then
  echo "ERROR: INSTANCE_PROFILE_NAME is required (EC2 IAM instance profile with SSM permissions)." >&2
  exit 1
fi

echo "[1/6] Resolving AMI, VPC and subnet in region ${REGION}..."
AMI_ID="${AMI_ID:-$(aws ssm get-parameter \
  --region "${REGION}" \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id \
  --query 'Parameter.Value' \
  --output text)}"

VPC_ID="${VPC_ID:-$(aws ec2 describe-vpcs \
  --region "${REGION}" \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' \
  --output text)}"

SUBNET_ID="${SUBNET_ID:-$(aws ec2 describe-subnets \
  --region "${REGION}" \
  --filters Name=vpc-id,Values="${VPC_ID}" Name=default-for-az,Values=true \
  --query 'Subnets[0].SubnetId' \
  --output text)}"

if [[ "${AMI_ID}" == "None" || "${VPC_ID}" == "None" || "${SUBNET_ID}" == "None" ]]; then
  echo "ERROR: failed to resolve AMI/VPC/SUBNET (check region and AWS permissions)." >&2
  exit 1
fi

echo "[2/6] Ensuring security group ${SG_NAME} exists (no inbound)..."
SG_ID="$(aws ec2 describe-security-groups \
  --region "${REGION}" \
  --filters Name=group-name,Values="${SG_NAME}" Name=vpc-id,Values="${VPC_ID}" \
  --query 'SecurityGroups[0].GroupId' \
  --output text)"

if [[ "${SG_ID}" == "None" ]]; then
  SG_ID="$(aws ec2 create-security-group \
    --region "${REGION}" \
    --group-name "${SG_NAME}" \
    --description "DevOps Solver security group (Cloudflare Tunnel origin, no inbound)" \
    --vpc-id "${VPC_ID}" \
    --query 'GroupId' \
    --output text)"
fi

echo "[3/6] Revoking any existing inbound rules..."
INGRESS_JSON="$(aws ec2 describe-security-groups \
  --region "${REGION}" \
  --group-ids "${SG_ID}" \
  --query 'SecurityGroups[0].IpPermissions' \
  --output json)"

if [[ "${INGRESS_JSON}" != "[]" ]]; then
  aws ec2 revoke-security-group-ingress \
    --region "${REGION}" \
    --group-id "${SG_ID}" \
    --ip-permissions "${INGRESS_JSON}" >/dev/null
fi

echo "[4/6] Ensuring outbound internet access exists..."
EGRESS_COUNT="$(aws ec2 describe-security-groups \
  --region "${REGION}" \
  --group-ids "${SG_ID}" \
  --query 'length(SecurityGroups[0].IpPermissionsEgress)' \
  --output text)"

if [[ "${EGRESS_COUNT}" == "0" ]]; then
  aws ec2 authorize-security-group-egress \
    --region "${REGION}" \
    --group-id "${SG_ID}" \
    --ip-permissions '[{"IpProtocol":"-1","IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]' >/dev/null
fi

echo "[5/6] Launching EC2 instance..."
INSTANCE_ID="$(aws ec2 run-instances \
  --region "${REGION}" \
  --image-id "${AMI_ID}" \
  --instance-type "${INSTANCE_TYPE}" \
  --iam-instance-profile Name="${INSTANCE_PROFILE_NAME}" \
  --security-group-ids "${SG_ID}" \
  --subnet-id "${SUBNET_ID}" \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --user-data "file://deploy/ec2-user-data.sh" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${TAG_NAME}}]" \
  --query 'Instances[0].InstanceId' \
  --output text)"

echo "[6/6] Waiting for instance to become running..."
aws ec2 wait instance-running --region "${REGION}" --instance-ids "${INSTANCE_ID}"

echo
echo "Instance launched successfully."
echo "  REGION=${REGION}"
echo "  INSTANCE_ID=${INSTANCE_ID}"
echo "  SECURITY_GROUP_ID=${SG_ID}"
echo
echo "Next steps:"
echo "  1) Wait 1-2 minutes for SSM agent registration."
echo "  2) Connect:"
echo "     aws ssm start-session --region ${REGION} --target ${INSTANCE_ID}"
echo "  3) Deploy app on instance using ./deploy/deploy_on_instance.sh instructions."

