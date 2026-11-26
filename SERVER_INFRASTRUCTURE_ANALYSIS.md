# Koraa Server Infrastructure Analysis & Deployment Plan

## 🔍 Current Infrastructure (Discovered)

### Server Details
- **Instance ID:** i-0bf590512e6f566c9
- **Public IP:** 44.215.174.165
- **DNS:** api.koraa.cm
- **User:** ubuntu
- **App Location:** /home/ubuntu/koraa

### Current Setup
```
Running Services:
├─ Docker containers (6 total):
│  ├─ koraa_backend (Django/Gunicorn) - Port 8000
│  ├─ koraa_celery_worker - Background tasks
│  ├─ koraa_celery_beat - Scheduled tasks
│  ├─ koraa_nginx - Reverse proxy (Ports 80, 443)
│  ├─ koraa_db (PostgreSQL) - Port 5432
│  └─ koraa_redis - Port 6379
│
├─ Gunicorn processes:
│  ├─ 3 workers
│  ├─ 2 threads per worker
│  └─ Binding: 0.0.0.0:8000
│
└─ Current branch: feat/direct-pay-plans
```

### Architecture
```
Internet (Port 80/443)
    ↓
koraa_nginx (Docker container)
    ↓
koraa_backend (Django/Gunicorn on port 8000)
    ↓
├─ koraa_db (PostgreSQL)
├─ koraa_redis (Cache/Celery)
└─ koraa_celery_worker/beat (Background jobs)
```

---

## 🚀 Safe Deployment Plan for Template Marketplace

### Phase 1: Pre-Deployment Checks ✅

**What we know:**
- System uses Docker Compose (infrastructure/docker/docker-compose.ec2.yml)
- Current branch is `feat/direct-pay-plans` (needs to switch to `staging`)
- Backend is healthy and running
- Uses Gunicorn with 3 workers

### Phase 2: Deploy to Staging Branch

```bash
# SSH to server
ssh ubuntu@44.215.174.165

# Navigate to app
cd /home/ubuntu/koraa

# Fetch staging branch
git fetch origin staging

# Check what will change
git diff feat/direct-pay-plans..origin/staging --stat

# Checkout staging
git checkout staging
git pull origin staging
```

### Phase 3: Fix PaymentTransaction Model

**CRITICAL: Do this BEFORE migrations!**

```bash
# Edit the model
nano backend/apps/payments/models.py

# Find line ~53 and add null=True to these fields:
# - external_id
# - fapshi_transaction_id  
# - plan

# Changes needed:
# Line ~53: external_id = models.CharField(..., null=True, blank=True, db_index=True, ...)
# Line ~55: fapshi_transaction_id = models.CharField(..., null=True, blank=True, ...)
# Line ~63: plan = models.CharField(..., null=True, blank=True, ...)
```

### Phase 4: Run Migrations via Docker

```bash
# Access the backend container
docker exec -it koraa_backend bash

# Inside container:
cd /app

# Create migrations
python manage.py makemigrations payments
python manage.py makemigrations themes

# Review migrations
python manage.py showmigrations

# Apply migrations
python manage.py migrate

# Exit container
exit
```

### Phase 5: Restart Services

```bash
# Restart backend container to pick up changes
docker restart koraa_backend

# Wait for health check
docker ps | grep koraa_backend

# Restart celery workers (if needed)
docker restart koraa_celery_worker
docker restart koraa_celery_beat
```

### Phase 6: Verify Deployment

```bash
# Test API endpoint
curl http://localhost:8000/api/v1/templates/

# Check logs
docker logs koraa_backend --tail 50

# Test from outside
curl https://api.koraa.cm/api/v1/templates/
```

---

## 🌐 Create staging.koraa.cm Subdomain

### Option A: Vercel Configuration (Frontend)

The frontend is on Vercel. To add staging subdomain:

1. **In Vercel Dashboard:**
   - Go to project settings
   - Domains → Add Domain
   - Add: `staging.koraa.cm`
   - Point to `staging` git branch

2. **DNS Configuration:**
   ```
   Type: CNAME
   Name: staging
   Value: cname.vercel-dns.com
   TTL: Auto
   ```

### Option B: Nginx on EC2 (If needed for backend staging)

If you want a separate staging backend:

```bash
# SSH to server
ssh ubuntu@44.215.174.165

# Edit nginx config in container
docker exec -it koraa_nginx bash

# Add server block for staging
cat >> /etc/nginx/conf.d/staging.conf << 'EOF'
server {
    listen 80;
    server_name staging.koraa.cm;

    location / {
        proxy_pass http://koraa_backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Test config
nginx -t

# Reload
nginx -s reload

# Exit
exit
```

Then add DNS:
```
Type: A
Name: staging
Value: 44.215.174.165
TTL: Auto
```

---

## 📋 Deployment Checklist

**Before Deployment:**
- [x] Understand current infrastructure (Docker-based)
- [x] Identify running services
- [x] Locate app directory (/home/ubuntu/koraa)
- [x] Confirm current branch (feat/direct-pay-plans)

**During Deployment:**
- [ ] SSH to server: `ssh ubuntu@44.215.174.165`
- [ ] Pull staging branch
- [ ] Fix PaymentTransaction model (add null=True)
- [ ] Run migrations in Docker container
- [ ] Restart backend container
- [ ] Verify API endpoints work

**After Deployment:**
- [ ] Test: `curl https://api.koraa.cm/api/v1/templates/`
- [ ] Create test template in admin
- [ ] Configure Fapshi webhook
- [ ] Set up staging.koraa.cm subdomain
- [ ] Test frontend at staging subdomain

---

## 🚨 Rollback Plan

If anything breaks:

```bash
# Rollback to previous branch
cd /home/ubuntu/koraa
git checkout feat/direct-pay-plans

# Restart containers
docker restart koraa_backend koraa_celery_worker koraa_celery_beat

# Or full restart
cd infrastructure/docker
docker-compose -f docker-compose.ec2.yml restart
```

---

## 🔧 Troubleshooting Commands

```bash
# Check container health
docker ps

# View backend logs
docker logs koraa_backend --tail 100 -f

# Check database
docker exec -it koraa_db psql -U koraa_user -d koraa_db -c "\dt"

# Restart specific service
docker restart koraa_backend

# Full system restart
cd /home/ubuntu/koraa/infrastructure/docker
docker-compose -f docker-compose.ec2.yml down
docker-compose -f docker-compose.ec2.yml up -d
```

---

## 📊 What This Deployment Adds

**New API Endpoints:**
- `/api/v1/templates/` - Template marketplace
- `/api/v1/templates/{slug}/purchase/` - Purchase with Fapshi
- `/api/v1/templates/webhook/` - Payment webhooks
- Plus 10+ more endpoints

**New Database Tables:**
- `templates` - Template listings
- `template_versions` - Version history
- `template_purchases` - Purchase records
- `template_reviews` - User reviews
- `revenue_splits` - 70/30 payout tracking

**Admin Interface:**
- `/admin/themes/template/` - Template moderation
- Revenue split tracking
- Payout management

---

## ⚡ Quick Deploy Script

```bash
#!/bin/bash
# Run this on the server

cd /home/ubuntu/koraa

# Pull staging
git fetch origin staging
git checkout staging
git pull origin staging

# Fix model (do manually first!)
echo "Edit backend/apps/payments/models.py - add null=True to 3 fields"
echo "Press Enter when done..."
read

# Run migrations
docker exec -it koraa_backend python manage.py makemigrations payments
docker exec -it koraa_backend python manage.py makemigrations themes
docker exec -it koraa_backend python manage.py migrate

# Restart
docker restart koraa_backend koraa_celery_worker koraa_celery_beat

# Test
sleep 5
curl http://localhost:8000/api/v1/templates/

echo "Deployment complete!"
```

---

**Current Status:** Infrastructure analyzed, ready for manual deployment.

**Next Step:** You need to SSH to the server and run the deployment commands above.
