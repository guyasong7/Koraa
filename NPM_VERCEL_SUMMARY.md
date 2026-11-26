## 🎯 Summary: NPM & Vercel Staging Setup

### ✅ What's Done

1. **SDK Ready for NPM**
   - Dry-run successful
   - Package size: 2.1 KB (10.2 KB unpacked)
   - Files: 5 (CJS, ESM, TypeScript definitions)
   - Name: `@koraa/storefront-sdk@1.0.0`

2. **Code Pushed to Staging**
   - Commit: `4ac4710` - SDK + Electronics Store template
   - Pushed to: `origin/staging`
   - Ready for Vercel auto-deploy

3. **GitHub Action Created**
   - Auto-publishes SDK on push to main
   - Located: `.github/workflows/publish-sdk.yml`
   - Requires: `NPM_TOKEN` secret in GitHub

---

### 📋 Manual Steps Required

#### 1. Publish SDK to NPM (One-Time)

```bash
cd /home/reconraven/Documents/projects/koraa/packages/storefront-sdk
npm login
npm publish --access public
```

**You'll need:**
- NPM account (create at npmjs.com)
- Username, password, email
- 2FA code (if enabled)

---

#### 2. Set Up staging.koraa.cm on Vercel

**Using Vercel Dashboard:**

1. Visit: https://vercel.com/dashboard
2. Select your Koraa project
3. **Settings** → **Domains**
4. Click **Add Domain**
5. Enter: `staging.koraa.cm`
6. Click **Add**
7. **Settings** → **Git**
8. Enable automatic deployments for `staging` branch

**DNS Configuration:**
- If DNS is on Vercel: ✅ Automatic
- If external DNS: Add CNAME `staging` → `cname.vercel-dns.com`

---

#### 3. Add Environment Variables

In Vercel project:

**Settings** → **Environment Variables**

Add these for `staging` branch:
```
NEXT_PUBLIC_API_URL=https://api.koraa.cm
NEXT_PUBLIC_ENVIRONMENT=staging
```

---

#### 4. Add NPM Token to GitHub (For Auto-Publish)

1. Go to: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Create token: **Automation** type
3. Copy token
4. Go to GitHub: https://github.com/guyasong7/Koraa/settings/secrets/actions
5. Add secret: `NPM_TOKEN` = your token

---

### 🎉 Expected Results

**After NPM Publish:**
```bash
npm install @koraa/storefront-sdk
```

**After Vercel Setup:**
- Staging: https://staging.koraa.cm
- Templates: https://staging.koraa.cm/templates
- Auto-deploy on push to `staging` branch

**After GitHub Secret:**
- SDK auto-publishes when merged to `main`

---

### 📝 Guides Created

1. **NPM_PUBLISH_GUIDE.md** - Detailed NPM publishing instructions
2. **VERCEL_STAGING_SETUP.md** - Complete Vercel setup guide
3. **QUICK_DEPLOY.md** - Quick reference for both
4. **.github/workflows/publish-sdk.yml** - Auto-publish action

---

### 🔄 Development Workflow

```bash
# Work on features
git checkout -b feature/new-template

# Commit changes
git commit -m "feat: add new template"

# Merge to staging
git checkout staging
git merge feature/new-template
git push origin staging
# → Auto-deploys to staging.koraa.cm

# Test on staging
# Visit https://staging.koraa.cm

# If good, merge to main
git checkout main
git merge staging
git push origin main
# → Auto-deploys to koraa.cm
# → Auto-publishes SDK (if changed)
```

---

**Ready for you to:**
1. Run `npm login` + `npm publish --access public`
2. Add `staging.koraa.cm` domain in Vercel
3. Test the staging deployment

All guides are in the project root directory!
