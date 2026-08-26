#!/bin/bash
# Cloud-init user-data for the Koraa API instance.
#
# Installs Docker Engine and the Compose v2 plugin from Docker's own apt
# repository — not Ubuntu's docker.io package, which ships no compose plugin, so
# `docker compose` would not exist and only the deprecated standalone
# docker-compose binary would be installable.
#
# Runs once, as root, on first boot. Output lands in /var/log/koraa-bootstrap.log
# as well as the usual /var/log/cloud-init-output.log.
set -euxo pipefail
exec > >(tee -a /var/log/koraa-bootstrap.log) 2>&1

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg git ufw unattended-upgrades

# Docker's apt repository and signing key.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

# So `docker` works over SSH without sudo. Takes effect on the next login.
usermod -aG docker ubuntu

# A second lock inside the security group. Only what the SG already allows.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Security updates apply themselves; this box is not going to be patched by hand.
systemctl enable --now unattended-upgrades

# 2GB of swap. t3.medium has 4GB of RAM and this stack runs Postgres, Redis,
# three gunicorn workers, a Celery worker and beat. Docker image builds are the
# real spike — a Next.js-free build is modest, but pip resolving wheels is not,
# and the OOM killer taking out Postgres mid-migration is a much worse outcome
# than a slow build.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Marker the deploy step waits on, so it cannot start while apt still holds locks.
touch /var/lib/koraa-bootstrap-complete
echo "bootstrap complete: $(date -Is)"
