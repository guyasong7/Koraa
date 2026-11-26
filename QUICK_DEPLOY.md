# 🚀 Quick Deploy Guide

## 1. Publish SDK to NPM

```bash
cd /home/reconraven/Documents/projects/koraa/packages/storefront-sdk

# Login to NPM (one time)
npm login

# Publish the SDK
npm publish --access public
```

**Result:** `@koraa/storefront-sdk` will be available at:
- NPM: https://www.npmjs.com/package/@koraa/storefront-sdk
- Install: `npm install @koraa/storefront-sdk`

---

## 2. Deploy Frontend to staging.koraa.cm

### Option A: Vercel Dashboard (Easiest)

1. **Go to:** https://vercel.com/dashboard
2. **Select:** Your Koraa project
3. **Settings** → **Domains** → **Add Domain**
4. **Enter:** `staging.koraa.cm`
5. **Git** → **Deploy Branch:** Select `staging`
6. **Save**

Vercel will automatically deploy when you push to staging branch.

### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy staging
cd /home/reconraven/Documents/projects/koraa/apps/web
vercel --prod
```

---

## 3. Configure DNS

### If using Vercel DNS:
✅ Automatic - Vercel handles it

### If using external DNS (Namecheap, Cloudflare, etc.):

Add CNAME record:
```
Type: CNAME
Name: staging
Value: cname.vercel-dns.com
TTL: Auto
```

---

## 4. Set Environment Variables

In Vercel Dashboard:

**Settings** → **Environment Variables** → Add:

```
NEXT_PUBLIC_API_URL=https://api.koraa.cm
NEXT_PUBLIC_ENVIRONMENT=staging
```

Select: **staging** branch

---

## 5. Verify Deployment

```bash
# Check if staging is live
curl -I https://staging.koraa.cm

# Visit in browser
open https://staging.koraa.cm/templates
```

---

## Current Status

✅ **Staging branch pushed** to GitHub
✅ **SDK ready to publish** (dry-run successful)
✅ **Template committed** (Electronics Store Pro)

**Waiting on:**
1. NPM login + publish
2. Vercel staging domain setup
3. DNS configuration (if external)

---

## Expected Result

After setup:
- 📦 **SDK:** `npm install @koraa/storefront-sdk`
- 🌐 **Staging:** https://staging.koraa.cm
- 🛒 **Templates:** https://staging.koraa.cm/templates
- 🔧 **API:** https://api.koraa.cm/api/v1/templates/

**Workflow:**
- Push to `staging` → Auto-deploy to staging.koraa.cm
- Push to `main` → Auto-deploy to koraa.cm
