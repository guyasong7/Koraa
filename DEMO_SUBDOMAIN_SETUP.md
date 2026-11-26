# Demo Subdomain Implementation Complete ✅

## Summary
Updated middleware to support template demos at `demo.koraa.cm/store/[template-name]`.

---

## ✅ Changes Applied

### 1. Middleware Update (`apps/web/src/middleware.ts`)

**Added Demo Subdomain Handling:**
```typescript
// Special handling for demo.koraa.cm - allow /store/ paths through
if (host === `demo.${ROOT_DOMAIN}`) {
  // demo.koraa.cm/store/electronics-store should work as-is
  return NextResponse.next();
}
```

**Updated Comments:**
- Clarified that "demo" is NOT a reserved subdomain
- It's specifically used for template demos at `demo.koraa.cm/store/[template-name]`

---

## 🎯 How It Works

**URL Pattern:**
- `demo.koraa.cm/store/electronics-store` → Renders store with slug "electronics-store"
- `demo.koraa.cm/store/fashion-boutique` → Renders store with slug "fashion-boutique"
- etc.

**Middleware Logic:**
1. Request comes to `demo.koraa.cm/store/electronics-store`
2. Middleware detects `demo.` subdomain
3. Passes through without rewriting (lets `/store/` route handle it)
4. Next.js routes to `apps/web/src/app/store/[domain]/page.tsx`
5. Backend API resolves "electronics-store" as a store slug

---

## 📝 Next Steps to Make Demo Stores Work

### Option 1: Create Actual Demo Stores in Database (Recommended)

SSH into the server and create demo stores:

```bash
ssh -i ~/.ssh/koraa-ec2.pem ubuntu@44.215.174.165
cd /home/ubuntu/koraa/backend
python3 manage.py shell
```

```python
from apps.stores.models import Store
from apps.users.models import User

# Get or create a demo user
demo_user = User.objects.filter(email='demo@koraa.cm').first()
if not demo_user:
    demo_user = User.objects.create_user(
        email='demo@koraa.cm',
        username='demo',
        password='demo_password_12345'
    )

# Create electronics store demo
Store.objects.create(
    owner=demo_user,
    name='Electronics Store Pro',
    slug='electronics-store',
    description='Modern electronics storefront with shopping cart',
    is_published=True
)
```

### Option 2: Static Demo Pages

Create static demo pages at:
- `apps/web/src/app/store/electronics-store/page.tsx`

This would bypass the database but only work for specific hardcoded demos.

---

## 🚀 Deployment Status

**Branch:** staging  
**Commit:** cc76258  
**Status:** ✅ Pushed to origin

**What Was Changed:**
- `apps/web/src/middleware.ts` - Added demo subdomain handling

**Vercel Deployment:**
- Will auto-deploy from staging
- `demo.koraa.cm` subdomain should route correctly once deployed

---

## 🧪 Testing

Once deployed, test:

1. **With Database Store:**
   ```bash
   curl -I https://demo.koraa.cm/store/electronics-store
   # Should return 200 if store exists in DB
   ```

2. **API Endpoint:**
   ```bash
   curl https://api.koraa.cm/api/v1/storefronts/by-domain/electronics-store
   # Should return store data
   ```

---

## ⚠️ Important Notes

1. **DNS Setup:**
   - `demo.koraa.cm` must point to Vercel
   - Should be configured in Vercel project domains

2. **Store Must Exist:**
   - Backend API must have a store with slug "electronics-store"
   - Or any other slug you want to demo

3. **Template Upload:**
   - Use `/dashboard/templates/new` to upload the demo-electronics-store
   - Templates are separate from demo stores

---

## 📊 Complete Flow

```
User visits: demo.koraa.cm/store/electronics-store
           ↓
Middleware: Detects demo subdomain, passes through
           ↓
Next.js routes to: /store/[domain]/page.tsx
           ↓
Page fetches: api.koraa.cm/api/v1/storefronts/by-domain/electronics-store
           ↓
Backend resolves: Store with slug "electronics-store"
           ↓
Renders: Storefront with products from that store
```

---

## ✅ Summary

- ✅ Middleware updated to support demo subdomain
- ✅ Code pushed to staging
- 🔄 Next: Create demo stores in database OR static pages
- 🔄 Next: Verify Vercel has demo.koraa.cm domain configured

The infrastructure is ready - now we just need actual demo stores to display!
