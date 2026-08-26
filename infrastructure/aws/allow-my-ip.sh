#!/usr/bin/env bash
# Point the security group's SSH rule at whatever address this machine has now.
#
# The admin address is a /32 rather than a wider block on purpose: port 22 is the
# one way onto the box, and the ranges an ISP hands out are shared. The cost of
# that choice is this script — a residential or carrier-NAT address rotates,
# sometimes within the hour, and when it does SSH stops answering and *times out*
# rather than refusing, which reads exactly like a broken instance.
#
# So if ssh hangs, run this first. It is idempotent: it removes whatever /32 was
# authorized before, so repeated runs leave exactly one rule.
#
#   ./infrastructure/aws/allow-my-ip.sh
#
# If it stops working entirely, the instance also has SSM Session Manager
# attached, which needs no inbound port at all:
#   aws ssm start-session --target <instance-id> --region us-east-1
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
GROUP_NAME="${KORAA_SG_NAME:-koraa-api-sg}"

ip=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')
[ -n "$ip" ] || { echo "could not determine public IP" >&2; exit 1; }

sg=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=group-name,Values=$GROUP_NAME" \
  --query 'SecurityGroups[0].GroupId' --output text)
[ "$sg" != "None" ] || { echo "no security group named $GROUP_NAME" >&2; exit 1; }

echo "security group $sg, current address $ip"

# Existing SSH CIDRs, so stale ones do not accumulate.
existing=$(aws ec2 describe-security-groups --region "$REGION" --group-ids "$sg" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`22`].IpRanges[].CidrIp' \
  --output text)

for cidr in $existing; do
  if [ "$cidr" = "$ip/32" ]; then
    echo "$ip/32 is already authorized; nothing to do"
    exit 0
  fi
  echo "revoking stale $cidr"
  aws ec2 revoke-security-group-ingress --region "$REGION" --group-id "$sg" \
    --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$cidr}]" \
    >/dev/null
done

aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$sg" \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$ip/32,Description='admin SSH'}]" \
  >/dev/null
echo "authorized $ip/32 on port 22"
