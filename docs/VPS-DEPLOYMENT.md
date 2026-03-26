# VPS Production Deployment Guide

Deploy the Swarm scraper worker to a Ubuntu 24.04 VPS with Port 25 open for full SMTP email verification.

---

## Prerequisites

- A VPS running **Ubuntu 24.04 LTS** (DigitalOcean, Hetzner, Vultr, Linode)
- **Minimum specs:** 2 vCPU, 4 GB RAM, 40 GB SSD
- SSH access as root or a sudo user
- Your `.env` file ready locally with all secrets filled in

> **Why VPS?** Your local ISP blocks Port 25, causing all SMTP `RCPT TO` checks to time out. A VPS with Port 25 open enables real deliverability verification — the difference between 30% confidence `UNKNOWN` and 90% confidence `VALID`.

---

## Step 1 — Connect to Your VPS

```bash
ssh root@YOUR_VPS_IP
```

Create a non-root user (recommended):

```bash
adduser swarm
usermod -aG sudo swarm
su - swarm
```

---

## Step 2 — Install Docker

```bash
# Remove any old Docker installs
sudo apt-get remove -y docker docker-engine docker.io containerd runc

# Install prerequisites
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine + Compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow current user to run Docker without sudo
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

---

## Step 3 — Configure Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 5432/tcp   # PostgreSQL (only if you need external DB access)
sudo ufw --force enable
sudo ufw status
```

> **Port 25:** Ubuntu 24.04 VPS providers (DigitalOcean, Hetzner) allow Port 25 by default. Some require you to open a support ticket to enable outbound SMTP. Check your provider's documentation if SMTP verification still fails.

---

## Step 4 — Clone the Repository

```bash
# Install git if needed
sudo apt-get install -y git

# Clone your repo
git clone https://github.com/YOUR_USERNAME/swarm-lead-scraper.git
cd swarm-lead-scraper
```

---

## Step 5 — Transfer Your `.env` File

From your **local machine** (not the VPS), run:

```bash
scp d:/LEADS2/swarm-lead-scraper/.env swarm@YOUR_VPS_IP:~/swarm-lead-scraper/.env
```

Verify it landed:

```bash
# On the VPS
ls -la ~/swarm-lead-scraper/.env
head -5 ~/swarm-lead-scraper/.env
```

Ensure the file contains at minimum:

```env
DATABASE_URL=postgresql://swarm:swarm_secret@postgres:5432/swarm_leads
OPENAI_API_KEY=sk-...
LOCAL_DEMO_MODE=false
HEADLESS=true
```

---

## Step 6 — Build and Start the Worker

```bash
cd ~/swarm-lead-scraper

# Build the Docker image and start the worker in detached mode
docker compose up -d --build scraper-worker

# Also start the database if not already running
docker compose up -d postgres
```

Check that both containers are running:

```bash
docker compose ps
```

Expected output:

```
NAME             IMAGE                    STATUS
swarm_postgres   postgres:15-alpine       Up (healthy)
swarm_worker     swarm-lead-scraper...    Up
```

---

## Step 7 — Monitor Logs

**Live log stream:**

```bash
docker compose logs -f scraper-worker
```

**Last 100 lines:**

```bash
docker compose logs --tail=100 scraper-worker
```

**Persistent log file (inside container):**

```bash
docker compose exec scraper-worker tail -f /app/logs/worker.log
```

**Check shared memory (confirm 1 GB):**

```bash
docker compose exec scraper-worker df -h /dev/shm
```

Expected: `1.0G` total.

---

## Step 8 — Verify Port 25 Is Open

From inside the running container:

```bash
docker compose exec scraper-worker bash -c "apt-get install -y netcat-openbsd 2>/dev/null; nc -zv smtp.gmail.com 25"
```

If it connects, SMTP verification is fully operational. If it times out, contact your VPS provider to enable outbound Port 25.

---

## Updating the Worker

When you push new code:

```bash
cd ~/swarm-lead-scraper
git pull origin main
docker compose up -d --build scraper-worker
```

Docker Compose will rebuild the image and replace the container with zero downtime for the database.

---

## Restart & Stop Commands

| Action | Command |
|--------|---------|
| Restart worker | `docker compose restart scraper-worker` |
| Stop everything | `docker compose down` |
| Stop + delete volumes | `docker compose down -v` ⚠️ destroys DB |
| View resource usage | `docker stats` |

---

## Troubleshooting

### Chromium crashes immediately
- Confirm `shm_size: '1gb'` is in `docker-compose.yml` under `scraper-worker`
- Run `docker compose exec scraper-worker df -h /dev/shm` — must show `1.0G`

### Container exits with code 1
```bash
docker compose logs scraper-worker --tail=50
```
Most common causes: missing `.env` file, invalid `DATABASE_URL`, Prisma migration failure.

### Database connection refused
- Ensure `postgres` is healthy: `docker compose ps`
- The `DATABASE_URL` inside the container must point to `postgres` (the service name), not `localhost`

### SMTP still returning UNKNOWN on VPS
- Test Port 25: `nc -zv smtp.gmail.com 25` from inside the container
- Contact your VPS provider (DigitalOcean: submit abuse form; Hetzner: enabled by default on non-residential plans)

---

> **Next step:** Open `docs/TRUTH-MATRIX.md` to confirm capability claims after VPS deployment with Port 25 open.
