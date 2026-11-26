# Staging Deployment Guide - Template Marketplace

## 🚀 Quick Deploy to Staging

The code has been pushed to the `staging` branch. Now deploy it to your staging server.

---

## Step 1: Find Your EC2 Instance

```bash
# List Koraa EC2 instances
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=*koraa*" \
  --query 'Reservations[*].Instances[*].[InstanceId,PublicIpAddress,State.Name,Tags[?Key==`Name`].Value|[0]]' \
  --output table

# Or using SSM
aws ssm describe-instance-information \
  --query 'InstanceInformationList[*].[InstanceId,ComputerName,PingStatus]' \
  --output table
```

---

## Step 2: SSH to Server

Based on your memory, the API deploys to EC2 via SSM:

```bash
# Option 1: Direct SSH (if you have the key)
ssh ubuntu@api.koraa.cm

# Option 2: AWS SSM Session Manager (no key needed)
aws ssm start-session --target INSTANCE_ID

# Option 3: SSM with SSH (recommended)
ssh -i ~/.ssh/deploy_key ubuntu@INSTANCE_ID
```

---

## Step 3: Pull Staging Branch

```bash
# On the server
cd /path/to/koraa  # Usually /var/www/koraa or /home/ubuntu/koraa

# Switch to ubuntu user (if needed)
sudo -u ubuntu bash

# Checkout staging branch
git fetch origin
git checkout staging
git pull origin staging
```

---

## Step 4: Apply Backend Changes

```bash
cd backend

# Activate virtual environment
source .venv/bin/activate  # or venv/bin/activate

# Install any new dependencies (if needed)
pip install -r requirements.txt

# Fix PaymentTransaction model FIRST (before migrations)
# Edit apps/payments/models.py and add null=True to these fields:
nano apps/payments/models.py

# Find line ~53 and change:
# external_id = models.CharField(max_length=100, unique=True, ...)
# To:
# external_id = models.CharField(max_length=100, null=True, blank=True, db_index=True, ...)

# Also add null=True to:
# - fapshi_transaction_id
# - plan

# Save and exit (Ctrl+X, Y, Enter)

# Create migrations
python manage.py makemigrations payments
python manage.py makemigrations themes

# Apply migrations
python manage.py migrate

# Collect static files
python manage.py collectstatic --noinput

# Restart backend service
sudo systemctl restart koraa-api  # or whatever your service is named
# Or if using Docker:
# docker-compose -f infrastructure/docker/docker-compose.ec2.yml restart
```

---

## Step 5: Check Backend Status

```bash
# Check service status
sudo systemctl status koraa-api

# Check logs
sudo journalctl -u koraa-api -f

# Or if using Docker:
docker-compose -f infrastructure/docker/docker-compose.ec2.yml logs -f backend

# Test API
curl http://localhost:8000/api/v1/templates/
```

---

## Step 6: Deploy Frontend (Vercel)

The frontend is on Vercel. It should auto-deploy when you push to staging, but verify:

```bash
# Check Vercel deployments
vercel ls

# Or manually trigger deploy
cd apps/web
vercel --prod  # for production
# or
vercel  # for preview
```

**Vercel should automatically:**
1. Detect the push to staging
2. Build the Next.js app
3. Deploy to staging subdomain (usually `staging.koraa.cm` or similar)

---

## Step 7: Verify Deployment

**Backend API:**
```bash
curl https://api.koraa.cm/api/v1/templates/
curl https://api.koraa.cm/api/v1/themes/
```

**Frontend:**
```bash
# Visit in browser:
https://staging.koraa.cm/templates
# or
https://koraa.cm/templates  # if staging uses main domain
```

---

## Step 8: Configure Fapshi Webhook

Update the Fapshi webhook URL to point to staging:

**Fapshi Dashboard:**
```
Webhook URL: https://api.koraa.cm/api/v1/templates/webhook/
```

---

## Staging Subdomain Setup (If Needed)

If staging doesn't have its own subdomain yet:

### Option A: Create staging.koraa.cm

**1. Add DNS Record (Vercel or Registrar):**
```
Type: CNAME
Name: staging
Value: cname.vercel-dns.com
```

**2. Configure in Vercel:**
- Go to project settings
- Add domain: `staging.koraa.cm`
- Point staging branch to this domain

### Option B: Use Vercel Preview URLs

Vercel automatically creates preview URLs:
```
https://koraa-git-staging-youraccount.vercel.app
```

---

## Quick Commands Reference

```bash
# Find EC2 instance
aws ec2 describe-instances --filters "Name=tag:Name,Values=*koraa*"

# SSH via SSM
aws ssm start-session --target i-XXXXXXXXX

# On server: Pull staging
cd /var/www/koraa && sudo -u ubuntu git pull origin staging

# On server: Apply migrations
cd backend && source .venv/bin/activate && python manage.py migrate

# On server: Restart service
sudo systemctl restart koraa-api

# Check deployment
curl https://api.koraa.cm/api/v1/templates/
```

---

## Troubleshooting

### Migration Fails

**Error:** `cannot add non-nullable field 'external_id'`

**Fix:**
```bash
# Edit backend/apps/payments/models.py
# Add null=True to external_id, fapshi_transaction_id, plan
nano backend/apps/payments/models.py

# Then run migrations again
python manage.py makemigrations payments
python manage.py migrate
```

### Service Won't Start

```bash
# Check logs
sudo journalctl -u koraa-api -n 50

# Check if port is in use
sudo lsof -i :8000

# Restart
sudo systemctl restart koraa-api
```

### Frontend Not Updating

```bash
# Check Vercel deployment status
vercel ls

# Manual deploy
cd apps/web
vercel --prod
```

---

## Expected Result

After deployment, you should have:

✅ **Backend API:** `https://api.koraa.cm/api/v1/templates/`
✅ **Frontend Gallery:** `https://staging.koraa.cm/templates`
✅ **Admin Panel:** `https://api.koraa.cm/admin/themes/template/`

---

## Post-Deployment Tasks

1. **Create test templates in admin**
2. **Configure Fapshi webhook URL**
3. **Test purchase flow with sandbox numbers**
4. **Verify revenue split tracking**

---

## Need Help?

- **Migration issues:** See `MIGRATION_FIX_GUIDE.md`
- **Full documentation:** See `COMPLETE_IMPLEMENTATION_ALL_WEEKS.md`
- **Quick reference:** See `TEMPLATES_README.md`

---

**You can now deploy the template marketplace to staging! 🚀**
