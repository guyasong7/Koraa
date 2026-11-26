# Setting Up staging.koraa.cm on Vercel

## Overview

Create a staging subdomain on Vercel for the frontend to test features before pushing to production.

---

## Step 1: Push Frontend Code to Staging Branch

```bash
cd /home/reconraven/Documents/projects/koraa

# Make sure you're on staging branch
git checkout staging

# If frontend changes aren't committed yet
git add apps/web/
git commit -m "feat: add template marketplace frontend"

# Push to staging branch
git push origin staging
```

---

## Step 2: Configure Vercel Project

### Option A: Using Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/dashboard
   - Select your Koraa project

2. **Add Staging Domain**
   - Go to **Settings** → **Domains**
   - Click **Add Domain**
   - Enter: `staging.koraa.cm`
   - Click **Add**

3. **Configure Git Branch**
   - Go to **Settings** → **Git**
   - Under **Production Branch**, keep it as `main`
   - Under **Preview Branches**, enable `staging`

4. **Connect Branch to Domain**
   - Go back to **Settings** → **Domains**
   - Find `staging.koraa.cm`
   - Click **Edit** → **Git Branch**
   - Select `staging` branch
   - Save

### Option B: Using Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
cd apps/web
vercel link

# Add staging domain
vercel domains add staging.koraa.cm

# Deploy staging branch
vercel --prod --branch staging
```

---

## Step 3: Configure DNS

### If DNS is on Vercel

Vercel will automatically configure DNS when you add the domain.

### If DNS is External (e.g., Namecheap, Cloudflare)

Add a CNAME record:

```
Type: CNAME
Name: staging
Value: cname.vercel-dns.com
TTL: Auto
```

---

## Step 4: Configure Environment Variables for Staging

1. **Go to Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**

2. **Add Staging-Specific Variables:**

```bash
# API URL for staging
NEXT_PUBLIC_API_URL=https://api.koraa.cm

# Or if you want staging API
NEXT_PUBLIC_API_URL=https://staging-api.koraa.cm

# Other environment variables
NEXT_PUBLIC_ENVIRONMENT=staging
```

3. **Select Branch:** Choose `staging` for each variable

---

## Step 5: Set Up Automatic Deployments

1. **Go to Settings** → **Git**

2. **Configure:**
   - ✅ **Production Branch:** `main` → deploys to `koraa.cm`
   - ✅ **Preview Branches:** `staging` → deploys to `staging.koraa.cm`
   - ✅ Auto-deploy on push

3. **Deploy on Push:**
   - Any push to `staging` branch auto-deploys to `staging.koraa.cm`
   - Any push to `main` branch auto-deploys to `koraa.cm`

---

## Step 6: Deploy Staging Now

### Trigger Deployment

```bash
# Option 1: Push to trigger auto-deploy
git push origin staging

# Option 2: Manual deploy via Vercel
vercel --prod

# Option 3: Via Vercel Dashboard
# Go to Deployments → Click "Deploy" → Select staging branch
```

---

## Step 7: Verify Deployment

```bash
# Check staging site
curl -I https://staging.koraa.cm

# Check in browser
open https://staging.koraa.cm

# Check API connection
# Visit: https://staging.koraa.cm/templates
```

---

## Project Structure

```
Vercel Project: koraa-web
├─ main branch → koraa.cm (production)
└─ staging branch → staging.koraa.cm (staging)

Backend (EC2):
└─ staging branch → api.koraa.cm
```

---

## Environment Variable Strategy

### Production (main → koraa.cm)
```env
NEXT_PUBLIC_API_URL=https://api.koraa.cm
NEXT_PUBLIC_ENVIRONMENT=production
```

### Staging (staging → staging.koraa.cm)
```env
NEXT_PUBLIC_API_URL=https://api.koraa.cm
NEXT_PUBLIC_ENVIRONMENT=staging
```

---

## Workflow

### Development Workflow

```bash
# 1. Work on feature branch
git checkout -b feature/template-gallery

# 2. Make changes
# ... code ...

# 3. Test locally
npm run dev

# 4. Merge to staging
git checkout staging
git merge feature/template-gallery
git push origin staging
# → Auto-deploys to staging.koraa.cm

# 5. Test on staging
# Visit https://staging.koraa.cm

# 6. If good, merge to main
git checkout main
git merge staging
git push origin main
# → Auto-deploys to koraa.cm
```

---

## Troubleshooting

### Domain not resolving
- Wait 5-10 minutes for DNS propagation
- Check DNS records: `dig staging.koraa.cm`
- Verify CNAME points to `cname.vercel-dns.com`

### Deployment failed
- Check Vercel dashboard for build logs
- Verify environment variables are set
- Check build command in `package.json`

### Wrong API URL
- Check environment variables in Vercel
- Verify branch-specific variables
- Redeploy after changing variables

---

## Quick Commands

```bash
# Check current deployments
vercel ls

# View logs
vercel logs

# Remove domain
vercel domains rm staging.koraa.cm

# Force redeploy
vercel --force
```

---

## Expected Result

After setup:
- ✅ `staging.koraa.cm` shows latest staging branch
- ✅ `koraa.cm` shows latest main branch
- ✅ Push to staging auto-deploys to staging.koraa.cm
- ✅ Push to main auto-deploys to koraa.cm

---

**Next Steps:**
1. Run the commands above to deploy staging
2. Visit https://staging.koraa.cm to verify
3. Test template marketplace features
4. Merge to main when ready
