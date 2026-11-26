# 🚀 Staging Environment Guide

**Last Updated:** 2024-11-26  
**Branch:** `staging`  
**Purpose:** Test all new features before deploying to production

---

## 📋 Overview

Your staging environment is a complete replica of production where you can safely test new features, bug fixes, and updates before they reach your live users.

---

## 🌳 Branch Structure

```
main (production)
  ↑
  │ merge after testing
  │
staging (testing)
  ↑
  │ merge feature branches here
  │
feature/* branches (development)
```

---

## 🔄 Workflow

### 1. Creating New Features

```bash
# Start from main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feat/your-feature-name

# Make your changes...
# Commit your work...

# Push feature branch
git push origin feat/your-feature-name
```

### 2. Deploy to Staging for Testing

```bash
# Switch to staging
git checkout staging
git pull origin staging

# Merge your feature
git merge feat/your-feature-name --no-ff

# Push to staging
git push origin staging
```

### 3. Test on Staging

- Test all functionality thoroughly
- Check for bugs and issues
- Verify integrations work
- Get team/client approval

### 4. Deploy to Production (After Testing)

```bash
# Switch to main
git checkout main
git pull origin main

# Merge staging (all tested features)
git merge staging --no-ff

# Tag the release
git tag -a v1.x.x -m "Release version 1.x.x"

# Push to production
git push origin main
git push origin --tags
```

---

## 🌐 Environment URLs

### Production
- **Frontend:** https://koraa.cm, https://www.koraa.cm
- **API:** https://api.koraa.cm
- **Storefronts:** https://*.koraa.cm
- **Branch:** `main`

### Staging (Recommended Setup)
- **Frontend:** https://staging.koraa.cm or staging subdomain on Vercel
- **API:** https://staging-api.koraa.cm or separate EC2/domain
- **Storefronts:** https://*.staging.koraa.cm
- **Branch:** `staging`

---

## ⚙️ Setting Up Staging Environment

### Option 1: Vercel Preview Deployments (Easiest)

Vercel automatically creates preview URLs for every branch:

```bash
# Push staging branch
git push origin staging

# Vercel creates: https://koraa-git-staging-your-team.vercel.app
```

**Configuration:**
1. Go to Vercel Dashboard → Project Settings
2. Git → Branch Deployment
3. Enable: "Preview Deployments for All Branches"
4. Set staging-specific environment variables

### Option 2: Dedicated Staging Domain

**Frontend (Vercel):**
1. Add custom domain in Vercel: `staging.koraa.cm`
2. Point to staging branch
3. Configure DNS: CNAME to Vercel

**Backend (EC2):**
1. Set up separate EC2 instance OR
2. Use same EC2 with different docker-compose service
3. Point `staging-api.koraa.cm` to it

---

## 🔐 Staging Environment Variables

### Frontend (Vercel)

Create staging-specific environment variables:

```bash
# In Vercel Dashboard → Settings → Environment Variables
# Select "Preview" or "Staging Branch" scope

NEXT_PUBLIC_API_URL=https://staging-api.koraa.cm/api/v1
KORAA_PUBLIC_FIREBASE_API_KEY=<staging-firebase-key>
KORAA_PUBLIC_FIREBASE_AUTH_DOMAIN=<staging-auth-domain>
# ... other KORAA_PUBLIC_* variables

# Use same production values OR create separate Firebase project
```

### Backend (EC2)

Create `backend/.env.staging`:

```bash
DEBUG=True  # Can enable debug in staging
SECRET_KEY=<different-secret-key-for-staging>
DATABASE_URL=postgresql://user:pass@staging-db-host:5432/koraa_staging
REDIS_URL=redis://staging-redis:6379/0

# Use Fapshi test credentials
FAPSHI_API_KEY=<test-api-key>
FAPSHI_API_USER=<test-user>

# Separate storage
AWS_STORAGE_BUCKET_NAME=koraa-media-staging

# Same or separate services
RESEND_API_KEY=<can-use-same-or-separate>
OPENROUTER_API_KEY=<can-use-same>
```

---

## 🧪 Testing Checklist

Before merging staging → main:

### Frontend Testing
- [ ] Landing page loads correctly
- [ ] Authentication (login, register, password reset)
- [ ] Dashboard functionality
- [ ] Store creation and management
- [ ] Product CRUD operations
- [ ] Storefront rendering (all templates)
- [ ] Checkout flow
- [ ] Payment processing (use test mode)
- [ ] Mobile responsiveness

### Backend Testing
- [ ] API endpoints respond correctly
- [ ] Authentication & authorization
- [ ] Database migrations applied
- [ ] Webhook handlers working
- [ ] Background tasks (Celery)
- [ ] Email delivery
- [ ] File uploads to R2
- [ ] Payment integration (test mode)

### Integration Testing
- [ ] Frontend ↔ Backend communication
- [ ] Firebase authentication
- [ ] Payment processing (Fapshi test)
- [ ] Email delivery (Resend)
- [ ] KYC flow (Didit test)
- [ ] AI features (OpenRouter)

### Security Testing
- [ ] Authentication works correctly
- [ ] Authorization prevents unauthorized access
- [ ] CORS headers correct
- [ ] CSRF protection enabled
- [ ] Rate limiting working
- [ ] Input validation
- [ ] No sensitive data exposed

---

## 🔄 Staging Deployment Process

### Automated (Recommended)

**Frontend (Vercel):**
```bash
# Automatic on push
git push origin staging
# Vercel deploys automatically
```

**Backend (EC2 Staging Instance):**

Create deployment script: `deploy-staging.sh`

```bash
#!/bin/bash
set -e

echo "🚀 Deploying to STAGING..."

# SSH to staging server
ssh -i ~/.ssh/deploy_key ubuntu@staging-api.koraa.cm << 'EOF'
  cd /home/ubuntu/koraa
  
  # Pull latest staging
  sudo -u ubuntu git fetch origin
  sudo -u ubuntu git checkout staging
  sudo -u ubuntu git pull origin staging
  
  # Backend
  cd backend
  sudo docker-compose -f ../infrastructure/docker/docker-compose.staging.yml down
  sudo docker-compose -f ../infrastructure/docker/docker-compose.staging.yml build
  sudo docker-compose -f ../infrastructure/docker/docker-compose.staging.yml up -d
  
  # Run migrations
  sudo docker-compose -f ../infrastructure/docker/docker-compose.staging.yml exec -T backend python manage.py migrate
  
  # Collect static
  sudo docker-compose -f ../infrastructure/docker/docker-compose.staging.yml exec -T backend python manage.py collectstatic --noinput
  
  echo "✅ Staging deployed successfully!"
EOF
```

### Manual Backend Deployment

```bash
# SSH to staging server
ssh -i ~/.ssh/deploy_key ubuntu@staging-api.koraa.cm

# Navigate to project
cd /home/ubuntu/koraa

# Pull staging
sudo -u ubuntu git checkout staging
sudo -u ubuntu git pull origin staging

# Rebuild and restart
cd backend
sudo docker-compose -f ../infrastructure/docker/docker-compose.staging.yml down
sudo docker-compose -f ../infrastructure/docker/docker-compose.staging.yml build
sudo docker-compose -f ../infrastructure/docker/docker-compose.staging.yml up -d

# Run migrations
sudo docker-compose -f ../infrastructure/docker/docker-compose.staging.yml exec backend python manage.py migrate
```

---

## 📊 Monitoring Staging

### Check Deployment Status

**Vercel:**
```bash
# Install Vercel CLI
npm i -g vercel

# Check deployments
vercel ls

# View logs
vercel logs <deployment-url>
```

**Backend:**
```bash
# Check container status
ssh ubuntu@staging-api.koraa.cm 'docker ps'

# View logs
ssh ubuntu@staging-api.koraa.cm 'docker logs koraa-backend-staging'

# Check health
curl https://staging-api.koraa.cm/health/
```

---

## 🐛 Debugging in Staging

### Frontend (Next.js)

```bash
# View Vercel deployment logs
vercel logs --follow

# Check browser console
# Open staging site → F12 → Console tab
```

### Backend (Django)

```bash
# SSH to server
ssh ubuntu@staging-api.koraa.cm

# View Django logs
docker logs -f koraa-backend-staging

# Access Django shell
docker exec -it koraa-backend-staging python manage.py shell

# Check database
docker exec -it koraa-db-staging psql -U postgres -d koraa_staging
```

---

## 🔧 Staging-Specific Configuration

### Database

Option 1: Separate staging database
```bash
# Create staging database on same PostgreSQL instance
docker exec -it koraa-db psql -U postgres
CREATE DATABASE koraa_staging;
```

Option 2: Copy production data to staging (for realistic testing)
```bash
# Dump production
pg_dump koraa_prod > prod_dump.sql

# Restore to staging
psql koraa_staging < prod_dump.sql

# Anonymize sensitive data
# Run script to change emails, phone numbers, etc.
```

### File Storage

Use separate S3/R2 bucket:
```bash
# In backend/.env.staging
AWS_STORAGE_BUCKET_NAME=koraa-media-staging
```

---

## 🎯 Best Practices

### 1. Keep Staging in Sync
```bash
# Regularly update staging from main
git checkout staging
git merge main --no-ff
git push origin staging
```

### 2. Test Before Merging
- Never merge untested code to main
- Run full test suite on staging
- Get approval from stakeholders

### 3. Use Feature Flags
```python
# backend/config/settings/base.py
FEATURE_FLAGS = {
    'NEW_CHECKOUT_FLOW': env.bool('FEATURE_NEW_CHECKOUT', default=False),
}

# Enable in staging, disable in production
# Then gradually enable in production
```

### 4. Database Migrations
```bash
# Test migrations on staging first
python manage.py makemigrations
python manage.py migrate --plan  # Review migration plan
python manage.py migrate  # Apply on staging

# If successful, merge to main
```

### 5. Rollback Plan
```bash
# If staging deployment fails
git checkout staging
git reset --hard origin/staging

# Or revert specific merge
git revert -m 1 <merge-commit-hash>
git push origin staging
```

---

## 📝 Staging Release Process

### Weekly Release Cycle (Example)

**Monday-Thursday:** Development
- Create feature branches
- Merge to staging
- Test on staging

**Friday:** Release to Production
1. Final staging tests
2. Merge staging → main
3. Deploy to production
4. Monitor for issues

**Emergency Hotfixes:**
```bash
# Create hotfix from main
git checkout main
git checkout -b hotfix/critical-bug

# Fix bug, test locally
# Deploy to staging first
git checkout staging
git merge hotfix/critical-bug

# After testing, merge to main
git checkout main
git merge hotfix/critical-bug
git push origin main
```

---

## 🚨 Common Issues

### Issue: Staging deployment fails

**Solution:**
```bash
# Check logs
vercel logs  # Frontend
docker logs koraa-backend-staging  # Backend

# Common causes:
# - Missing environment variables
# - Database migration errors
# - Build errors
```

### Issue: Environment variables not updated

**Solution:**
```bash
# Vercel: Redeploy after updating env vars
vercel --prod

# Backend: Restart containers
docker-compose restart
```

### Issue: Database out of sync

**Solution:**
```bash
# Run migrations
docker exec koraa-backend-staging python manage.py migrate

# Check migration status
docker exec koraa-backend-staging python manage.py showmigrations
```

---

## 📚 Related Documentation

- **00_START_HERE.md** - Project overview
- **SECURITY_SUMMARY.md** - Security guidelines
- **PROJECT_OVERVIEW.md** - Technical architecture
- **docs/DEPLOYMENT.md** - Production deployment guide

---

## 🎓 Git Workflow Summary

```bash
# Daily development workflow:

1. Create feature branch
   git checkout -b feat/my-feature

2. Make changes and commit
   git add .
   git commit -m "feat: add new feature"

3. Push feature branch
   git push origin feat/my-feature

4. Merge to staging for testing
   git checkout staging
   git merge feat/my-feature
   git push origin staging

5. Test on staging thoroughly

6. If tests pass, merge to main
   git checkout main
   git merge staging
   git push origin main

7. If tests fail, fix on feature branch
   git checkout feat/my-feature
   # make fixes
   git commit -m "fix: address staging issues"
   # repeat from step 3
```

---

## ✅ Current Staging Status

**Branch:** `staging`  
**Last Sync:** 2024-11-26  
**Status:** ✅ Up to date with main  
**Ready for:** New feature testing

**Next Steps:**
1. Set up staging deployment on Vercel (or use preview URLs)
2. Configure staging-specific environment variables
3. Test your next feature on staging before production

---

**Remember:** Staging is your safety net. Always test here before production! 🛡️

---

**End of Staging Guide**

*Last Updated: 2024-11-26*
