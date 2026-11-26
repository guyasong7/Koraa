# Koraa Platform — Security Code Review Findings

**Date:** 2024-11-26  
**Reviewer:** Security Code Audit  
**Scope:** Backend (Django/DRF) + Frontend (Next.js) code analysis  
**Method:** Manual code review for common vulnerability patterns

---

## Executive Summary

A comprehensive code review was conducted on the Koraa eCommerce platform. The review focused on authentication, authorization, injection vulnerabilities, XSS, IDOR, and API security.

**Overall Security Posture:** ✅ **GOOD**

The codebase demonstrates strong security practices with proper tenant isolation, JWT authentication, and secure defaults. Several best practices are already implemented:

- ✅ Production security hardening enforced
- ✅ Proper tenant isolation via `accessible_stores()`
- ✅ No raw SQL queries found
- ✅ Strong password requirements and SECRET_KEY validation
- ✅ Proper JWT token handling with rotation and blacklisting
- ✅ Webhook signature verification (Didit, Fapshi)
- ✅ Idempotent payment settlement with `settled_at` timestamps

**Findings Summary:**
- 🔴 **Critical:** 0
- 🟠 **High:** 1
- 🟡 **Medium:** 4
- 🔵 **Low:** 3
- ℹ️ **Informational:** 5

---

## Findings

### 🟠 HIGH SEVERITY

#### H-1: Missing HttpOnly Flag on Session Cookies

**Location:** `backend/config/settings/production.py`

**Current State:**
```python
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
```

**Issue:**
The `SESSION_COOKIE_HTTPONLY` and `CSRF_COOKIE_HTTPONLY` flags are not explicitly set. While Django defaults `SESSION_COOKIE_HTTPONLY` to `True`, it's not guaranteed for CSRF cookies, and explicit configuration is a security best practice.

**Impact:**
Without `HttpOnly` flag, cookies could be accessed via JavaScript if an XSS vulnerability exists, enabling session hijacking.

**Proof of Concept:**
```javascript
// If XSS exists and HttpOnly is false:
document.cookie // Could read session tokens
```

**Remediation:**
Add to `backend/config/settings/production.py`:
```python
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = 'Lax'
```

**References:**
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

---

### 🟡 MEDIUM SEVERITY

#### M-1: dangerouslySetInnerHTML with JSON Data

**Location:** `apps/web/src/app/(landing)/layout.tsx:128,132`

**Current Code:**
```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(siteLinksSearchBox) }}
/>
```

**Issue:**
Using `dangerouslySetInnerHTML` with `JSON.stringify()`. While the data is currently hardcoded and safe, this pattern is risky if the data source changes.

**Impact:**
If `jsonLd` or `siteLinksSearchBox` ever contain user input or data from an API, XSS could occur.

**Risk Assessment:**
Currently **LOW RISK** because data is hardcoded static objects. However, the pattern itself is dangerous.

**Remediation:**
1. **Preferred:** Use Next.js `<Script>` component with `dangerouslySetInnerHTML` only for static data
2. **Alternative:** Add explicit validation/sanitization:
```tsx
import DOMPurify from 'isomorphic-dompurify';

<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ 
    __html: DOMPurify.sanitize(JSON.stringify(jsonLd), { 
      ALLOWED_TAGS: [], 
      ALLOWED_ATTR: [] 
    })
  }}
/>
```
3. **Best Practice:** Document that these objects must NEVER contain user input

**References:**
- [React dangerouslySetInnerHTML](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)

---

#### M-2: Public Endpoints Without Rate Limiting

**Location:** Multiple files

**Affected Endpoints:**
```python
# backend/apps/storefront/views.py:1039
class StorefrontPublicAPIView(APIView):
    authentication_classes = []
    # No throttle_classes defined

# backend/apps/analytics/views.py:41
class CollectEventView(APIView):
    authentication_classes = []
    # No throttle_classes defined
```

**Issue:**
Several public endpoints lack explicit rate limiting. While some are protected by application-level logic, others could be abused for DoS or data scraping.

**Public Endpoints Found:**
1. `/api/v1/public/stores/{slug}/` - Store details (no rate limit)
2. `/api/v1/public/analytics/collect/` - Analytics collection (no rate limit)
3. `/api/v1/public/storefront/*` - Various storefront APIs (no rate limit)
4. `/api/v1/merchants/identity/webhook/` - Didit webhook (signature verified, but no rate limit)
5. `/api/v1/payments/webhook/` - Fapshi webhook (should have rate limit)

**Protected Endpoints (Good):**
- ✅ `/api/v1/public/storefront/orders/{id}/pay/` - Has `ScopedRateThrottle` with scope `checkout-pay`

**Impact:**
- DoS attacks via repeated requests
- Store enumeration via slug guessing
- Analytics pollution

**Remediation:**
Add rate limiting to all public endpoints:

```python
# In settings/base.py
REST_FRAMEWORK = {
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'checkout-pay': '10/hour',
        'public-api': '300/hour',
        'webhook': '100/hour',
    }
}

# In each public view:
class StorefrontPublicAPIView(APIView):
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public-api'

class CollectEventView(APIView):
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public-api'
```

**Note:** This is marked MEDIUM because fail2ban and nginx rate limiting provide network-level protection, but application-level throttling is still recommended.

---

#### M-3: CORS Configuration May Be Too Permissive

**Location:** `backend/config/settings/base.py:354-371`

**Current Configuration:**
```python
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://koraa.cm",
        "https://www.koraa.cm",
    ],
)
```

**Issue:**
The code mentions that custom merchant domains require manual addition to `CORS_ALLOWED_ORIGINS`. This could lead to:
1. Forgotten additions when merchants add custom domains
2. Growing whitelist that's hard to manage
3. Potential for misconfiguration

**Impact:**
- Custom domain storefronts may fail with CORS errors
- Workaround of adding wildcard `*` would be insecure

**Current State in Production:**
Needs verification - check actual `CORS_ALLOWED_ORIGINS` environment variable on EC2.

**Remediation Options:**

**Option 1: Same-Origin API (Recommended)**
```python
# Already documented in deployment notes
NEXT_PUBLIC_API_URL=/api/v1  # Relative path
# nginx proxies /api/v1 to backend, eliminating CORS entirely
```

**Option 2: Dynamic CORS Validation**
```python
# Custom CORS origin validator
def cors_origin_whitelist_check(origin, whitelist):
    from urllib.parse import urlparse
    parsed = urlparse(origin)
    hostname = parsed.hostname
    
    # Allow koraa.cm and all subdomains
    if hostname and (
        hostname == 'koraa.cm' or 
        hostname.endswith('.koraa.cm')
    ):
        return True
    
    # Check verified custom domains from database
    from apps.stores.models import Store
    if Store.objects.filter(
        custom_domain=hostname, 
        domain_verified=True
    ).exists():
        return True
    
    return False

# In settings:
CORS_ORIGIN_WHITELIST = []  # Empty - use custom validator
CORS_ALLOW_ALL_ORIGINS = False
```

**Option 3: Subdomain Pattern Match**
```python
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://[\w-]+\.koraa\.cm$",  # Any subdomain
    r"^https://koraa\.cm$",           # Apex
    r"^http://localhost:\d+$",        # Local dev
]
```

**Recommended:** Use Option 1 (same-origin via nginx) for simplicity and security.

---

#### M-4: No Content Security Policy (CSP)

**Location:** Frontend and backend headers

**Issue:**
No `Content-Security-Policy` header detected in the codebase. CSP provides defense-in-depth against XSS attacks.

**Impact:**
If an XSS vulnerability exists, CSP would not block malicious script execution.

**Current State:**
- ✅ Other security headers are configured (X-Frame-Options, X-Content-Type-Options)
- ❌ No CSP header found

**Remediation:**

For Next.js (Vercel deployment):
```typescript
// next.config.ts
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              "connect-src 'self' https://api.koraa.cm https://firebaseapp.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};
```

For Django (nginx config):
```nginx
# infrastructure/nginx/koraa-api.conf
add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'none';" always;
```

**Note:** Start with a permissive policy in report-only mode, then tighten:
```
Content-Security-Policy-Report-Only: ...
```

---

### 🔵 LOW SEVERITY

#### L-1: Missing Explicit Field Whitelists in Some Serializers

**Location:** Various serializer files

**Issue:**
Some serializers may use `fields = '__all__'` or lack explicit `read_only_fields`, increasing mass assignment risk.

**Status:** ✅ **NO VIOLATIONS FOUND**

Manual check revealed no instances of `fields = '__all__'` in serializers. This is good practice.

**Recommendation:**
Continue enforcing explicit field lists in code reviews:
```python
# Good
class StoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = ['id', 'name', 'slug', 'status']
        read_only_fields = ['id', 'created_at']

# Bad - never use this
class StoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = '__all__'  # ❌ Avoid
```

---

#### L-2: Order Status Polling Without Jitter

**Location:** `apps/web/src/app/store/[domain]/checkout/page.tsx` (inferred)

**Issue:**
The checkout page polls order status every N seconds. Without jitter, multiple simultaneous checkouts hit the backend at synchronized intervals.

**Impact:**
- Minor: Synchronized polling creates traffic spikes
- Could be optimized with exponential backoff + jitter

**Remediation:**
```typescript
// Add jitter to polling interval
const baseInterval = 2000; // 2 seconds
const jitter = Math.random() * 1000; // 0-1 second
const interval = baseInterval + jitter;

setTimeout(pollStatus, interval);
```

---

#### L-3: Error Messages May Leak Implementation Details

**Location:** Various API endpoints

**Issue:**
Some error messages could reveal information about system internals:
```python
# Example from orders/views.py
raise CheckoutError(f"Product {item['product_id']} is not available in this shop.")
```

**Impact:**
UUID in error message confirms product exists but is unavailable, enabling product enumeration.

**Current Risk:** LOW - requires authentication in most cases

**Remediation:**
Use generic messages for public endpoints:
```python
# Good for public endpoints
raise CheckoutError("One or more items in your cart are no longer available.")

# OK for authenticated endpoints
raise CheckoutError(f"Product {item['product_id']} is not available.")
```

---

### ℹ️ INFORMATIONAL

#### I-1: Security Headers Present and Correctly Configured

**Location:** `backend/config/settings/production.py:11-20`

✅ **GOOD PRACTICES FOUND:**

```python
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"
```

This is excellent security configuration.

---

#### I-2: Proper Tenant Isolation Implemented

**Location:** `apps/stores/access.py` (referenced in multiple views)

✅ **GOOD PRACTICES FOUND:**

All store-scoped operations filter through `accessible_stores(user)`:
```python
# From stores/views.py:59
return accessible_stores(self.request.user).order_by("-created_at")

# From products/views.py:32
store = accessible_stores(user).filter(pk=store_pk).first()

# From orders/views.py:598
Order.objects.filter(store__in=accessible_stores(self.request.user))
```

This centralized approach prevents IDOR vulnerabilities.

---

#### I-3: JWT Token Security Properly Implemented

**Location:** `backend/config/settings/base.py:324-350`

✅ **GOOD PRACTICES FOUND:**

- Access tokens: 60 minutes
- Refresh tokens: 30 days
- Token rotation enabled (`ROTATE_REFRESH_TOKENS = True`)
- Blacklisting enabled (`BLACKLIST_AFTER_ROTATION = True`)
- Signing key validation in production

---

#### I-4: Webhook Signature Verification Implemented

**Location:** `backend/apps/merchants/views.py:456`

✅ **GOOD PRACTICES FOUND:**

```python
def post(self, request):
    signature = request.META.get("HTTP_X_SIGNATURE_V2", "")
    timestamp = request.META.get("HTTP_X_TIMESTAMP", "")
    
    if not didit.verify_webhook_signature(request.body, signature, timestamp):
        return Response({"error": "Invalid signature."}, status=status.HTTP_403_FORBIDDEN)
```

Webhooks are properly validated before processing.

---

#### I-5: Idempotent Payment Settlement

**Location:** `backend/apps/orders/models.py:98`, `backend/apps/payments/models.py:65`

✅ **GOOD PRACTICES FOUND:**

```python
# Order model
settled_at = models.DateTimeField(null=True, blank=True, db_index=True)

@property
def is_settled(self) -> bool:
    return self.settled_at is not None
```

The `settled_at` timestamp prevents double-processing of payments, which is critical for financial security.

---

## Security Best Practices Already Implemented

### Authentication & Authorization
- ✅ JWT with rotation and blacklisting
- ✅ Argon2 password hashing
- ✅ Firebase token verification
- ✅ Proper permission classes on views
- ✅ Tenant isolation via `accessible_stores()`

### Input Validation
- ✅ DRF serializer validation
- ✅ No raw SQL queries detected
- ✅ Parameterized queries via Django ORM
- ✅ File upload type validation

### Output Encoding
- ✅ React auto-escapes by default
- ✅ No unsafe `innerHTML` usage (only structured data in `dangerouslySetInnerHTML`)
- ✅ JSON responses properly serialized

### Session Management
- ✅ Secure cookies in production
- ✅ HTTPS enforcement
- ✅ HSTS enabled
- ✅ Proper CSRF protection

### Deployment Security
- ✅ DEBUG=False enforced in production
- ✅ SECRET_KEY validation (length + prefix check)
- ✅ ALLOWED_HOSTS validation
- ✅ Redis cache required (no silent fallback)
- ✅ Firebase project ID validation

---

## Recommendations by Priority

### Immediate (Fix Now)

1. **Add cookie security flags** (H-1)
   - File: `backend/config/settings/production.py`
   - Lines to add:
   ```python
   SESSION_COOKIE_HTTPONLY = True
   SESSION_COOKIE_SAMESITE = 'Lax'
   CSRF_COOKIE_HTTPONLY = True
   CSRF_COOKIE_SAMESITE = 'Lax'
   ```

2. **Add rate limiting to public endpoints** (M-2)
   - Files: `apps/storefront/views.py`, `apps/analytics/views.py`
   - Add `throttle_classes` to all public views

### Short Term (This Sprint)

3. **Implement Content Security Policy** (M-4)
   - Start with report-only mode
   - Monitor violations for 1 week
   - Enforce policy

4. **Review CORS configuration** (M-3)
   - Verify production `CORS_ALLOWED_ORIGINS`
   - Consider same-origin API approach
   - Document custom domain process

5. **Add documentation for safe dangerouslySetInnerHTML usage** (M-1)
   - Create guideline: "Never use with user input"
   - Add code review checklist item

### Medium Term (Next Month)

6. **Add polling jitter** (L-2)
   - Update checkout polling logic
   - Implement exponential backoff

7. **Sanitize error messages** (L-3)
   - Review all public endpoint errors
   - Use generic messages where appropriate

### Long Term (Backlog)

8. **Set up automated security scanning**
   - GitHub Dependabot
   - npm audit in CI/CD
   - pip-audit in CI/CD

9. **Penetration testing**
   - Use staging environment
   - Follow SECURITY_AUDIT_CHECKLIST.md
   - Hire external auditor (optional)

10. **Bug bounty program**
    - After penetration testing
    - Start with private program
    - Expand to public when mature

---

## Testing Verification

### Manual Tests Performed

1. ✅ **SQL Injection:** No raw queries found
2. ✅ **Mass Assignment:** No `fields = '__all__'` in serializers
3. ✅ **IDOR:** Proper tenant isolation via `accessible_stores()`
4. ✅ **Authentication:** JWT properly implemented
5. ✅ **Authorization:** Permission classes on all authenticated views
6. ⚠️ **Rate Limiting:** Only on some public endpoints
7. ⚠️ **XSS:** React auto-escapes, but `dangerouslySetInnerHTML` present (safe usage)
8. ⚠️ **CSP:** Not implemented
9. ✅ **Webhooks:** Signature verification present
10. ✅ **Idempotency:** `settled_at` prevents double-settlement

### Recommended Additional Testing

1. **Dependency audit:**
   ```bash
   cd backend && pip install pip-audit && pip-audit
   cd apps/web && npm audit
   ```

2. **Secret scanning:**
   ```bash
   git log -p | grep -E "(SECRET_KEY|API_KEY|PASSWORD)" | grep -v ".example"
   ```

3. **HTTPS verification:**
   ```bash
   curl -I https://koraa.cm | grep -i strict
   curl -I https://api.koraa.cm | grep -i strict
   ```

4. **JWT token test:**
   - Generate token
   - Modify payload
   - Verify rejection

---

## Summary

The Koraa platform demonstrates **strong security fundamentals** with proper authentication, authorization, and tenant isolation. The findings are mostly configuration improvements and defense-in-depth measures rather than critical vulnerabilities.

**Key Strengths:**
- Excellent tenant isolation architecture
- Proper JWT implementation
- Production security hardening
- Webhook security
- Idempotent payment processing

**Priority Improvements:**
1. Add cookie security flags (10 minutes)
2. Add rate limiting to public endpoints (2 hours)
3. Implement CSP (4 hours)
4. Review CORS configuration (1 hour)

**Overall Risk:** ✅ **LOW** - No critical vulnerabilities found. Platform is production-ready with recommended improvements applied.

---

**Auditor Notes:**
- No raw SQL injection vectors
- No authentication bypasses
- No IDOR vulnerabilities (proper filtering throughout)
- No sensitive data leakage in responses
- Payment flow is secure and idempotent
- File upload validation present

**Next Steps:**
1. Implement immediate fixes (H-1, M-2)
2. Run dependency audits
3. Test on staging with SECURITY_AUDIT_CHECKLIST.md
4. Consider external penetration test

---

**End of Security Findings Report**

*Last Updated: 2024-11-26*  
*Next Review: After implementing recommendations*
