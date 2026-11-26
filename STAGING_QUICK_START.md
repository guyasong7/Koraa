# Staging Branch Quick Start

## ✅ Staging Branch Created!

Your `staging` branch is now set up and synced with the latest `main` branch.

---

## 🌳 Current Branch Structure

```
main (production)
  ├─── Contains: Latest stable code (256 files updated)
  └─── Deployed: koraa.cm, api.koraa.cm

staging (testing) ← YOU ARE HERE
  ├─── Contains: Same as main (ready for new features)
  └─── Deploy: Set up staging URLs below

feature/* branches
  └─── Create these for new development
```

---

## 🚀 Quick Commands

### Switch Between Branches

```bash
# Switch to staging (for testing new features)
git checkout staging

# Switch to main (for production releases)
git checkout main

# View all branches
git branch -a
```

### Add New Features to Staging

```bash
# 1. Create feature branch from main
git checkout main
git checkout -b feat/your-feature-name

# 2. Make your changes, then commit
git add .
git commit -m "feat: add awesome feature"

# 3. Merge to staging for testing
git checkout staging
git merge feat/your-feature-name

# 4. Push to test
git push origin staging
```

### Deploy Staging to Production (After Testing)

```bash
# After testing on staging, merge to main
git checkout main
git merge staging --no-ff -m "release: deploy tested features to production"
git push origin main
```

---

## 🌐 Set Up Staging Deployment

### Option 1: Vercel Automatic Preview (Easiest)

Vercel automatically creates preview URLs for the `staging` branch:

```bash
# Just push staging
git push origin staging

# Vercel creates: https://koraa-git-staging-yourteam.vercel.app
```

**To configure:**
1. Go to Vercel Dashboard
2. Your Project → Settings → Git
3. Enable "All branches" for preview deployments
4. Access: `https://koraa-git-staging-*.vercel.app`

### Option 2: Custom Staging Domain

Add `staging.koraa.cm` subdomain:

1. **Vercel Dashboard:**
   - Go to Domains
   - Add: `staging.koraa.cm`
   - Set branch: `staging`

2. **DNS (your registrar):**
   ```
   CNAME staging 76.76.21.21.cname.vercel-dns.com
   ```

3. **Backend:** Use same EC2 or separate staging instance

---

## 📋 Workflow Example

### Scenario: Adding a new discount feature

```bash
# 1. Start from main
cd /home/reconraven/Documents/projects/koraa
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feat/bulk-discounts

# 3. Make your changes...
# Edit files, add features, etc.

# 4. Commit your work
git add .
git commit -m "feat: add bulk discount functionality"

# 5. Push feature branch
git push origin feat/bulk-discounts

# 6. Merge to staging for testing
git checkout staging
git merge feat/bulk-discounts

# 7. Push to staging
git push origin staging
# Vercel deploys automatically

# 8. Test on staging URL
# Open: https://koraa-git-staging-*.vercel.app
# Test thoroughly!

# 9. If tests pass → deploy to production
git checkout main
git merge staging
git push origin main

# 10. Clean up feature branch (optional)
git branch -d feat/bulk-discounts
git push origin --delete feat/bulk-discounts
```

---

## 🎯 What to Test on Staging

Before merging to production, verify:

✅ **Functionality**
- New features work as expected
- No regressions in existing features
- All user flows complete successfully

✅ **UI/UX**
- Design looks correct
- Responsive on mobile/tablet/desktop
- No visual glitches

✅ **Integration**
- API calls work
- Authentication flows
- Payment processing (test mode)
- Email delivery

✅ **Performance**
- Page load times acceptable
- No console errors
- Database queries efficient

---

## 🔧 Staging Environment Variables

Set these in Vercel for the staging branch:

```bash
# Vercel Dashboard → Settings → Environment Variables
# Select "Preview" scope or specific to "staging" branch

# Point to staging API (if separate)
NEXT_PUBLIC_API_URL=https://staging-api.koraa.cm/api/v1

# Or use production API for now
NEXT_PUBLIC_API_URL=https://api.koraa.cm/api/v1

# Same Firebase or separate staging project
KORAA_PUBLIC_FIREBASE_API_KEY=<your-key>
# ... other KORAA_PUBLIC_* variables
```

---

## 🚨 Important Notes

### Keep Staging Updated

Regularly sync staging with main:

```bash
git checkout staging
git merge main
git push origin staging
```

### Never Skip Staging

Always test on staging before production:
- ❌ Feature branch → main (BAD)
- ✅ Feature branch → staging → test → main (GOOD)

### Emergency Hotfixes

For critical production bugs:

```bash
# Create hotfix from main
git checkout main
git checkout -b hotfix/critical-bug

# Fix the bug
# ... make changes ...

# Test on staging first
git checkout staging
git merge hotfix/critical-bug
git push origin staging
# Test thoroughly!

# Then deploy to production
git checkout main
git merge hotfix/critical-bug
git push origin main
```

---

## 📊 Current Status

**Staging Branch:** ✅ Created and synced  
**Last Update:** 2024-11-26  
**Commits Ahead of Origin:** 0 (fully synced)  
**Current Branch:** `staging`

**Next Steps:**
1. ✅ Staging branch created
2. ⏳ Set up Vercel preview deployment
3. ⏳ Configure staging environment variables
4. ⏳ Test a feature on staging

---

## 📚 Full Documentation

For complete details, see **STAGING_GUIDE.md** (22 KB)

Topics covered:
- Detailed workflow
- Environment setup
- Testing checklist
- Deployment automation
- Troubleshooting
- Best practices

---

## 🎓 Remember

**The Golden Rule:**
> Every feature goes through staging before production.  
> No exceptions. Your users will thank you! 🙏

---

**Quick Reference:**
```bash
git checkout staging          # Switch to staging
git merge feat/feature-name   # Add feature to staging
git push origin staging       # Deploy for testing
# ... test thoroughly ...
git checkout main             # Switch to production
git merge staging             # Deploy tested features
git push origin main          # Push to production
```

---

You're all set! Start developing new features and test them on staging before production. 🚀

---

**Created:** 2024-11-26
