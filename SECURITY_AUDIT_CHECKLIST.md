# Koraa Platform — Security Audit Checklist & Best Practices

**Date Created:** 2024-10-04  
**Target:** koraa.cm (Vercel) + api.koraa.cm (AWS EC2)  
**Purpose:** Manual security testing checklist and deployment hardening guide

---

## Executive Summary

This document provides a structured approach to security testing and hardening for the Koraa platform. Given the split deployment architecture (Vercel frontend + AWS EC2 backend) and active rate limiting/fail2ban, automated scanning is not recommended. Instead, use this manual checklist.

---

## I. Pre-Testing Setup

### A. Testing Environment Preparation

**Recommended Approach:**
1. **Create a staging environment** separate from production
2. **Use VPN/proxy rotation** to avoid IP bans during testing
3. **Whitelist your testing IP** in fail2ban temporarily
4. **Document all test credentials** used

**Testing Tools to Install Locally:**
```bash
# Browser extensions
- Wappalyzer (technology detection)
- EditThisCookie (cookie manipulation)
- ModHeader (header modification)
- JSON Formatter

# Command-line tools
- curl (API testing)
- jq (JSON parsing)
- sqlmap (SQL injection testing - use carefully)
- nikto (web scanner - use on staging only)
- nmap (port scanning)
- OWASP ZAP or Burp Suite Community (manual proxy testing)
```

### B. Fail2ban Precautions

**Before testing on production:**
1. SSH into EC2 instance
2. Check current fail2ban status:
   ```bash
   sudo fail2ban-client status
   sudo fail2ban-client status nginx-http-auth
   sudo fail2ban-client status sshd
   ```
3. Temporarily whitelist your IP (optional):
   ```bash
   sudo fail2ban-client set nginx-http-auth addignoreip YOUR_IP
   ```
4. Monitor ban list during testing:
   ```bash
   sudo fail2ban-client status nginx-http-auth | grep "Banned IP"
   ```

---

## II. Authentication & Authorization Testing

### A. JWT Token Security

**Test Cases:**

1. **Token Expiration**
   - [ ] Verify access token expires after 60 minutes
   - [ ] Confirm refresh token expires after 30 days
   - [ ] Check that expired tokens are rejected with 401

2. **Token Rotation**
   - [ ] Verify refresh endpoint rotates refresh tokens
   - [ ] Confirm old refresh token is blacklisted after use
   - [ ] Test that blacklisted tokens cannot be reused

3. **Token Manipulation**
   ```bash
   # Get a valid token
   TOKEN=$(curl -X POST https://api.koraa.cm/api/v1/auth/login/ \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password"}' \
     | jq -r '.access')
   
   # Test with modified token (should fail)
   MODIFIED_TOKEN="${TOKEN}abc"
   curl -H "Authorization: Bearer $MODIFIED_TOKEN" \
     https://api.koraa.cm/api/v1/auth/me/
   ```
   - [ ] Modified tokens rejected
   - [ ] Token from different user cannot access resources
   - [ ] Algorithm confusion attack (change RS256 to HS256) blocked

4. **Secret Key Security**
   - [ ] Verify SECRET_KEY is not `django-insecure-*`
   - [ ] Confirm SECRET_KEY is at least 50 characters
   - [ ] Check SECRET_KEY is not committed to git
   ```bash
   cd /home/reconraven/Documents/projects/koraa
   git log -p | grep -i "SECRET_KEY" | grep -v ".example"
   ```

### B. OAuth/Social Login Security

**Test Cases:**

1. **Firebase Token Verification**
   - [ ] Invalid Firebase tokens rejected
   - [ ] Expired Firebase tokens rejected
   - [ ] Token from different Firebase project rejected
   - [ ] Check `FIREBASE_PROJECT_ID` matches between frontend/backend

2. **Account Takeover Scenarios**
   - [ ] Cannot link Google account to existing email without verification
   - [ ] Email verification required after OAuth signup
   - [ ] Test race condition: simultaneous OAuth + email signup

### C. Password Security

**Test Cases:**

1. **Password Requirements**
   ```bash
   # Test weak passwords
   curl -X POST https://api.koraa.cm/api/v1/auth/register/ \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com","password":"123","full_name":"Test"}'
   ```
   - [ ] Passwords under 8 characters rejected
   - [ ] Common passwords rejected (e.g., "password", "12345678")
   - [ ] No password complexity bypass via API

2. **Password Reset Flow**
   - [ ] Reset tokens expire after reasonable time
   - [ ] Reset token can only be used once
   - [ ] Rate limit on password reset requests
   - [ ] Token not leaked in URL (should be POST body)
   - [ ] Cannot reset another user's password

3. **Brute Force Protection**
   - [ ] Account lockout after N failed login attempts
   - [ ] Rate limiting on `/auth/login/` endpoint
   - [ ] CAPTCHA or similar on repeated failures (if implemented)

### D. Authorization & Permissions

**Test Cases:**

1. **Merchant-to-Merchant Isolation**
   ```bash
   # Login as Merchant A
   TOKEN_A=$(curl -X POST https://api.koraa.cm/api/v1/auth/login/ \
     -H "Content-Type: application/json" \
     -d '{"email":"merchantA@test.com","password":"password"}' \
     | jq -r '.access')
   
   # Try to access Merchant B's store
   curl -H "Authorization: Bearer $TOKEN_A" \
     https://api.koraa.cm/api/v1/stores/MERCHANT_B_STORE_UUID/
   ```
   - [ ] Cannot read other merchant's stores
   - [ ] Cannot update other merchant's products
   - [ ] Cannot view other merchant's orders
   - [ ] Cannot access other merchant's analytics

2. **Store-Level Permissions**
   - [ ] Team members can only access assigned store
   - [ ] Store roles enforced (admin vs manager vs support)
   - [ ] Cannot delete store without ownership
   - [ ] Cannot publish store without permission

3. **Customer Data Access**
   - [ ] Cannot access order details of other stores
   - [ ] Customer PII protected in API responses
   - [ ] Cannot enumerate customer list across stores

---

## III. IDOR (Insecure Direct Object Reference) Testing

### A. UUID Enumeration

**Test Cases:**

1. **Store Access**
   ```bash
   # Try accessing stores by UUID
   for uuid in $(cat potential_store_uuids.txt); do
     curl -H "Authorization: Bearer $TOKEN" \
       "https://api.koraa.cm/api/v1/stores/$uuid/"
   done
   ```
   - [ ] Cannot access other merchant's stores even with valid UUID
   - [ ] 403 Forbidden (not 404) for unauthorized access
   - [ ] No information leakage in error messages

2. **Product Access**
   - [ ] Cannot delete products from other stores
   - [ ] Cannot modify product prices via IDOR
   - [ ] Cannot access draft products from other stores

3. **Order Access**
   ```bash
   # Try accessing order by UUID
   curl -H "Authorization: Bearer $TOKEN" \
     "https://api.koraa.cm/api/v1/orders/OTHER_MERCHANT_ORDER_UUID/"
   ```
   - [ ] Cannot view orders from other merchants
   - [ ] Cannot mark other merchant's orders as paid
   - [ ] Cannot access customer PII from other orders

4. **File/Media Access**
   - [ ] Cannot access other merchant's uploaded images by URL manipulation
   - [ ] Digital product files protected (not direct media URLs)
   - [ ] Download grants require valid token
   - [ ] Cannot enumerate uploaded files

### B. Parameter Tampering

**Test Cases:**

1. **Mass Assignment**
   ```bash
   # Try to elevate role via mass assignment
   curl -X PATCH https://api.koraa.cm/api/v1/merchants/me/ \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"tier":"enterprise","is_verified":true}'
   ```
   - [ ] Cannot set `tier` directly (must go through payment)
   - [ ] Cannot set `is_verified` directly
   - [ ] Cannot modify `created_at` or other read-only fields
   - [ ] Serializer uses `fields` whitelist, not `exclude`

2. **Subscription Manipulation**
   ```bash
   # Try to extend subscription without payment
   curl -X PATCH https://api.koraa.cm/api/v1/payments/subscriptions/UUID/ \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"status":"active","expires_at":"2099-12-31T23:59:59Z"}'
   ```
   - [ ] Cannot directly modify subscription status
   - [ ] Cannot extend expiry date without payment
   - [ ] Subscription updates only through payment webhook

---

## IV. Cross-Site Scripting (XSS) Testing

### A. Stored XSS

**Test Cases:**

1. **Product Descriptions**
   ```bash
   # Create product with XSS payload
   curl -X POST https://api.koraa.cm/api/v1/stores/STORE_UUID/products/ \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test Product",
       "description": "<script>alert(\"XSS\")</script>",
       "base_price": "1000"
     }'
   ```
   - [ ] Script tags stripped or escaped
   - [ ] Event handlers (onclick, onerror) sanitized
   - [ ] SVG XSS vectors blocked
   - [ ] Check rendered output on storefront `/store/[domain]/product/[slug]`

2. **Store Names & Descriptions**
   - [ ] Store name with `<script>` tags escaped
   - [ ] Store tagline/description sanitized
   - [ ] Category names sanitized
   - [ ] Custom domain input validated

3. **Order Customer Data**
   ```bash
   # Submit order with XSS in customer name
   curl -X POST https://api.koraa.cm/api/v1/public/orders/ \
     -H "Content-Type: application/json" \
     -d '{
       "store": "STORE_UUID",
       "customer_name": "<img src=x onerror=alert(1)>",
       "customer_email": "test@test.com",
       "items": [{"product":"UUID","quantity":1,"price":"1000"}]
     }'
   ```
   - [ ] Customer name sanitized in merchant dashboard
   - [ ] Shipping address sanitized
   - [ ] Order notes sanitized

4. **Markdown Content**
   - [ ] Check if product descriptions support Markdown
   - [ ] If yes, test for Markdown XSS bypasses
   - [ ] Verify remark-gfm sanitization is configured

### B. Reflected XSS

**Test Cases:**

1. **Search Parameters**
   ```
   https://koraa.cm/dashboard/products?search=<script>alert(1)</script>
   ```
   - [ ] Search queries escaped in page output
   - [ ] No script execution in search results
   - [ ] Check for DOM-based XSS in search filtering

2. **Error Messages**
   ```bash
   curl "https://api.koraa.cm/api/v1/stores/<script>alert(1)</script>/"
   ```
   - [ ] Error messages don't reflect unsanitized input
   - [ ] UUID validation rejects script tags before processing

3. **Redirect Parameters**
   - [ ] Check for open redirect vulnerabilities
   - [ ] Validate redirect URLs against whitelist
   - [ ] No javascript: or data: URIs in redirects

### C. DOM-based XSS

**Test Cases:**

1. **Frontend Rendering**
   - [ ] Check for `dangerouslySetInnerHTML` in React components
   ```bash
   grep -r "dangerouslySetInnerHTML" /home/reconraven/Documents/projects/koraa/apps/web/src/
   ```
   - [ ] Verify all user input is sanitized before DOM manipulation
   - [ ] Check `innerHTML` usage in vanilla JS

2. **React-Markdown Usage**
   - [ ] Verify `react-markdown` configured with safe plugins
   - [ ] Test for Markdown injection attacks
   - [ ] Check `remark-gfm` for known vulnerabilities

---

## V. SQL Injection Testing

### A. ORM Query Safety

**Code Review Checklist:**

1. **Raw Queries**
   ```bash
   # Search for raw SQL usage
   grep -r "\.raw(" /home/reconraven/Documents/projects/koraa/backend/apps/
   grep -r "cursor\.execute" /home/reconraven/Documents/projects/koraa/backend/apps/
   grep -r "RawSQL" /home/reconraven/Documents/projects/koraa/backend/apps/
   ```
   - [ ] All raw queries use parameterized inputs (`%s` placeholders)
   - [ ] No string formatting in raw queries
   - [ ] No `.extra()` with SQL fragments

2. **Dynamic Filtering**
   ```bash
   # Check for unsafe filter construction
   grep -r "filter(\*\*" /home/reconraven/Documents/projects/koraa/backend/apps/
   ```
   - [ ] User input validated before `filter(**kwargs)`
   - [ ] Field names validated against whitelist
   - [ ] No arbitrary field access via user input

### B. Injection Test Cases

**Test Cases:**

1. **Search Endpoints**
   ```bash
   # Test SQL injection in search
   curl "https://api.koraa.cm/api/v1/stores/UUID/products/?search=test'%20OR%201=1--"
   ```
   - [ ] Quotes properly escaped
   - [ ] No error messages revealing database structure
   - [ ] Boolean-based injection blocked

2. **Filter Parameters**
   ```bash
   # Test injection in filters
   curl "https://api.koraa.cm/api/v1/orders/?status=paid'%20AND%201=1--"
   ```
   - [ ] Filter values sanitized
   - [ ] Invalid filter parameters rejected
   - [ ] No time-based injection possible

---

## VI. API Security Testing

### A. Rate Limiting

**Test Cases:**

1. **Authentication Endpoints**
   ```bash
   # Rapid login attempts
   for i in {1..100}; do
     curl -X POST https://api.koraa.cm/api/v1/auth/login/ \
       -H "Content-Type: application/json" \
       -d '{"email":"test@test.com","password":"wrong"}' &
   done
   ```
   - [ ] Rate limit enforced on `/auth/login/`
   - [ ] Rate limit enforced on `/auth/register/`
   - [ ] Rate limit enforced on `/auth/password-reset/request/`
   - [ ] 429 status code returned with Retry-After header

2. **Public Endpoints**
   - [ ] Rate limit on `/public/stores/{slug}/products/`
   - [ ] Rate limit on `/public/orders/` (checkout)
   - [ ] Rate limit on `/public/analytics/collect/`

3. **Authenticated Endpoints**
   - [ ] Higher rate limits for authenticated users
   - [ ] Per-user rate limiting (not per-IP)
   - [ ] Different limits for different tiers

### B. Mass Assignment

**Test Cases:**

1. **User Profile**
   ```bash
   curl -X PATCH https://api.koraa.cm/api/v1/auth/me/ \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"is_staff":true,"is_superuser":true,"role":"admin"}'
   ```
   - [ ] Cannot set `is_staff`
   - [ ] Cannot set `is_superuser`
   - [ ] Cannot change `role` directly
   - [ ] Cannot modify `date_joined`

2. **Merchant Profile**
   - [ ] Cannot set `is_verified` directly
   - [ ] Cannot modify `tier` without payment
   - [ ] Cannot change `referral_code`

### C. Information Disclosure

**Test Cases:**

1. **API Error Messages**
   - [ ] No stack traces in production responses
   - [ ] No database errors leaked to client
   - [ ] Generic error messages for 500 errors
   - [ ] No sensitive paths in error responses

2. **API Responses**
   - [ ] No password hashes in user responses
   - [ ] No tokens in merchant profile responses
   - [ ] No internal IDs or implementation details
   - [ ] Check for over-fetching (unnecessary fields)

3. **Debug Mode**
   ```bash
   curl -I https://api.koraa.cm/api/v1/
   ```
   - [ ] DEBUG=False in production
   - [ ] No Django debug toolbar accessible
   - [ ] No server version in headers
   - [ ] No X-Debug headers

### D. CORS Configuration

**Test Cases:**

1. **Origin Validation**
   ```bash
   # Test with unauthorized origin
   curl -X POST https://api.koraa.cm/api/v1/auth/login/ \
     -H "Origin: https://evil.com" \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com","password":"password"}' \
     -v
   ```
   - [ ] Only `koraa.cm` and `*.koraa.cm` allowed
   - [ ] Vercel preview URLs allowed (if needed)
   - [ ] No wildcard `Access-Control-Allow-Origin: *`
   - [ ] Credentials not allowed with wildcard

2. **Preflight Requests**
   - [ ] OPTIONS requests handled correctly
   - [ ] CORS headers present on error responses
   - [ ] nginx CORS config matches Django CORS config

---

## VII. File Upload Security

### A. Upload Validation

**Test Cases:**

1. **File Type Validation**
   ```bash
   # Upload PHP file as product image
   echo '<?php system($_GET["cmd"]); ?>' > shell.php
   curl -X POST https://api.koraa.cm/api/v1/stores/UUID/products/ \
     -H "Authorization: Bearer $TOKEN" \
     -F "name=Test" \
     -F "base_price=1000" \
     -F "images=@shell.php"
   ```
   - [ ] Non-image files rejected
   - [ ] File extension validated
   - [ ] MIME type validated
   - [ ] File content validated (magic bytes)

2. **File Size Limits**
   - [ ] Product images limited to reasonable size (e.g., 10MB)
   - [ ] Digital product files size-limited
   - [ ] Request body size limited in nginx

3. **Path Traversal**
   ```bash
   # Try to upload with path traversal
   curl -X POST https://api.koraa.cm/api/v1/merchants/me/ \
     -H "Authorization: Bearer $TOKEN" \
     -F "logo=@test.jpg;filename=../../etc/passwd"
   ```
   - [ ] Filenames sanitized
   - [ ] Path traversal sequences rejected
   - [ ] Files stored with safe, generated names

### B. Download Security

**Test Cases:**

1. **Digital Product Downloads**
   ```bash
   # Try to download without valid token
   curl "https://api.koraa.cm/media/products/files/2024/10/product.pdf"
   ```
   - [ ] Direct media URLs blocked for digital products
   - [ ] Download requires valid DownloadGrant token
   - [ ] Download link expires after window
   - [ ] Download count enforced

2. **Image Access**
   - [ ] Public product images accessible
   - [ ] Merchant-uploaded documents protected
   - [ ] Identity verification documents not publicly accessible

---

## VIII. Business Logic Vulnerabilities

### A. Payment Flow Security

**Test Cases:**

1. **Price Manipulation**
   ```bash
   # Try to modify order price
   curl -X POST https://api.koraa.cm/api/v1/public/orders/ \
     -H "Content-Type: application/json" \
     -d '{
       "store": "UUID",
       "items": [{"product":"UUID","quantity":1,"price":"1"}],
       "total_amount": "1"
     }'
   ```
   - [ ] Server recalculates total, doesn't trust client
   - [ ] Product prices fetched from database
   - [ ] Discount codes validated server-side
   - [ ] Cannot apply expired/invalid discount codes

2. **Race Conditions**
   - [ ] Test simultaneous order creation
   - [ ] Test simultaneous stock updates
   - [ ] Check for double-spend on digital products
   - [ ] Verify idempotency keys used where needed

3. **Webhook Validation**
   ```bash
   # Try to fake Fapshi webhook
   curl -X POST https://api.koraa.cm/api/v1/payments/webhook/ \
     -H "Content-Type: application/json" \
     -d '{"transId":"fake","status":"SUCCESSFUL","externalId":"ORDER_UUID"}'
   ```
   - [ ] Webhook signature verified
   - [ ] Webhook IP whitelist (if Fapshi provides IPs)
   - [ ] Cannot mark order as paid via fake webhook
   - [ ] `settled_at` prevents double-settlement

4. **Subscription Bypass**
   - [ ] Cannot create store beyond tier limit
   - [ ] Cannot create products beyond tier limit
   - [ ] Tier limits enforced before action, not after
   - [ ] Check `effective_tier` logic handles expiration

### B. Access Control Edge Cases

**Test Cases:**

1. **Team Member Permissions**
   - [ ] Team member cannot delete store
   - [ ] Team member cannot change store owner
   - [ ] Team member cannot access other stores
   - [ ] Role changes require owner permission

2. **Referral System**
   - [ ] Cannot set own referral code to another user's
   - [ ] Referral bonus only paid once
   - [ ] Cannot game referral system with fake accounts

---

## IX. Infrastructure Security

### A. TLS/SSL Configuration

**Test Cases:**

1. **Certificate Validation**
   ```bash
   # Check certificate
   echo | openssl s_client -connect koraa.cm:443 -servername koraa.cm 2>/dev/null | openssl x509 -noout -text
   echo | openssl s_client -connect api.koraa.cm:443 -servername api.koraa.cm 2>/dev/null | openssl x509 -noout -text
   ```
   - [ ] Valid wildcard cert for `*.koraa.cm`
   - [ ] Certificate not expired
   - [ ] Certificate chain complete
   - [ ] No self-signed certificates in production

2. **TLS Best Practices**
   - [ ] TLS 1.2+ only (no TLS 1.0/1.1)
   - [ ] Strong cipher suites only
   - [ ] HSTS header present
   - [ ] Secure renegotiation supported

3. **SSL Labs Test**
   - [ ] Run [SSL Labs test](https://www.ssllabs.com/ssltest/)
   - [ ] Target: A or A+ rating
   - [ ] No weak protocols
   - [ ] No weak ciphers

### B. HTTP Security Headers

**Test Cases:**

```bash
curl -I https://koraa.cm/ | grep -E "(X-|Content-Security|Strict)"
curl -I https://api.koraa.cm/api/v1/ | grep -E "(X-|Content-Security|Strict)"
```

**Required Headers:**
- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY` or `SAMEORIGIN`
- [ ] `X-XSS-Protection: 1; mode=block` (deprecated but harmless)
- [ ] `Content-Security-Policy` (recommended)
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy` (optional)

**Headers to Remove:**
- [ ] No `Server: Django` or version info
- [ ] No `X-Powered-By`
- [ ] No `X-AspNet-Version` or similar

### C. Server Configuration

**Test Cases:**

1. **Port Scanning**
   ```bash
   nmap -p- api.koraa.cm
   ```
   - [ ] Only 80, 443, and 22 open
   - [ ] No unnecessary services exposed
   - [ ] Database port not exposed (5432)
   - [ ] Redis port not exposed (6379)

2. **SSH Hardening**
   ```bash
   # SSH into EC2 instance
   ssh -v ubuntu@api.koraa.cm
   ```
   - [ ] SSH key-only authentication (no password)
   - [ ] Root login disabled
   - [ ] Non-standard SSH port (optional)
   - [ ] fail2ban active on SSH

3. **Firewall Rules**
   ```bash
   # On EC2 instance
   sudo ufw status
   sudo iptables -L
   ```
   - [ ] Only necessary ports open
   - [ ] AWS Security Groups properly configured
   - [ ] Rate limiting at firewall level

---

## X. Third-Party Integration Security

### A. Firebase Security

**Test Cases:**

1. **API Key Exposure**
   - [ ] Firebase API key in browser is expected (public)
   - [ ] Firebase security rules properly configured
   - [ ] Firestore/RTDB not publicly readable
   - [ ] Check Firebase console for security warnings

2. **Token Validation**
   - [ ] Backend verifies Firebase tokens with `firebase-admin`
   - [ ] Token audience checked
   - [ ] Token issuer validated
   - [ ] Expired tokens rejected

### B. Fapshi Integration

**Test Cases:**

1. **API Credentials**
   - [ ] Fapshi API keys not exposed in frontend
   - [ ] API keys stored in environment variables
   - [ ] No hardcoded credentials in code
   ```bash
   grep -r "fapshi" /home/reconraven/Documents/projects/koraa/apps/web/src/ --include="*.ts" --include="*.tsx"
   ```

2. **Webhook Security**
   - [ ] Webhook endpoint validates requests
   - [ ] IP whitelist or signature verification
   - [ ] Idempotency prevents replay attacks

### C. Cloudflare R2 / S3

**Test Cases:**

1. **Bucket Permissions**
   - [ ] Buckets not publicly listable
   - [ ] Public read only on intended files
   - [ ] No write access from public
   - [ ] Pre-signed URLs used for sensitive files

2. **Access Keys**
   - [ ] IAM keys have minimal permissions
   - [ ] Keys rotated regularly
   - [ ] No keys committed to git

---

## XI. Privacy & Compliance

### A. Data Protection

**Test Cases:**

1. **PII Handling**
   - [ ] Customer emails hashed in analytics
   - [ ] No PII in logs
   - [ ] No PII in URL parameters
   - [ ] Sensitive data encrypted at rest (database level)

2. **Right to Deletion**
   - [ ] User can delete account
   - [ ] Cascading deletes properly configured
   - [ ] Data retention policy documented

3. **Data Export**
   - [ ] User can export their data (GDPR)
   - [ ] Merchant can export customer data
   - [ ] Export includes all PII

### B. Cookie Security

**Test Cases:**

```bash
curl -I https://koraa.cm/ | grep -i "set-cookie"
```
- [ ] Session cookies have `HttpOnly` flag
- [ ] Session cookies have `Secure` flag
- [ ] Session cookies have `SameSite=Lax` or `Strict`
- [ ] No sensitive data in cookie values
- [ ] Cookie expiration appropriate

---

## XII. Dependency Security

### A. Outdated Packages

**Backend:**
```bash
cd /home/reconraven/Documents/projects/koraa/backend
source .venv/bin/activate
pip list --outdated
pip-audit  # Install: pip install pip-audit
```
- [ ] No critical CVEs in dependencies
- [ ] Django version up to date with security patches
- [ ] DRF up to date
- [ ] Celery, Redis clients up to date

**Frontend:**
```bash
cd /home/reconraven/Documents/projects/koraa/apps/web
npm audit
npm outdated
```
- [ ] No high/critical vulnerabilities
- [ ] Next.js version secure
- [ ] React version secure
- [ ] Check for known CVEs in direct dependencies

### B. Supply Chain Security

**Test Cases:**

1. **Package Verification**
   - [ ] `package-lock.json` committed and up to date
   - [ ] No suspicious packages in dependencies
   - [ ] Review recent dependency additions

2. **Typosquatting**
   - [ ] All package names spelled correctly
   - [ ] No unexpected packages in `node_modules`

---

## XIII. Monitoring & Logging

### A. Security Logging

**Test Cases:**

1. **Failed Login Attempts**
   ```bash
   # On EC2 instance
   sudo tail -f /var/log/nginx/access.log | grep "auth/login"
   cd /home/reconraven/Documents/projects/koraa/backend
   docker-compose logs -f backend | grep "login"
   ```
   - [ ] Failed logins logged
   - [ ] Successful logins logged (with IP)
   - [ ] Account lockouts logged

2. **Suspicious Activity**
   - [ ] 403/401 responses logged
   - [ ] Rate limit violations logged
   - [ ] File upload attempts logged
   - [ ] Admin access logged

3. **Log Security**
   - [ ] Logs don't contain passwords
   - [ ] Logs don't contain tokens
   - [ ] Logs don't contain credit card data
   - [ ] Log rotation configured

### B. Fail2ban Rules

**Review Configuration:**
```bash
# On EC2 instance
sudo fail2ban-client status
cat /etc/fail2ban/jail.local
cat /etc/fail2ban/filter.d/*.conf
```

**Recommended Rules:**
- [ ] SSH brute force protection
- [ ] HTTP auth failures
- [ ] WordPress/admin path probing
- [ ] SQL injection attempt patterns
- [ ] XSS attempt patterns
- [ ] API rate limit violations

---

## XIV. Penetration Testing Execution

### A. Safe Testing Protocol

**Step-by-Step:**

1. **Reconnaissance (Passive)**
   - Use Wappalyzer, BuiltWith
   - Check DNS records: `dig koraa.cm ANY`
   - Review public GitHub repos (if any)
   - Check Archive.org for historical data
   - Google dorking: `site:koraa.cm inurl:admin`

2. **Reconnaissance (Active - Low Risk)**
   - Port scan: `nmap -Pn -p 80,443 koraa.cm api.koraa.cm`
   - Directory enumeration (use wordlist, rate-limited)
   - Subdomain enumeration
   - SSL/TLS analysis

3. **Vulnerability Assessment (Manual)**
   - Walk through each checklist item above
   - Use Burp Suite in passive mode
   - Manual form submissions
   - API endpoint testing with curl

4. **Exploitation (Controlled)**
   - **Only test on staging environment**
   - Document all findings
   - Do not exfiltrate data
   - Do not modify production data
   - Stop if you detect actual vulnerability

### B. Reporting

**For Each Finding:**

1. **Severity Classification**
   - Critical: Remote code execution, SQL injection, authentication bypass
   - High: XSS, IDOR, sensitive data exposure
   - Medium: CSRF, rate limit bypass, information disclosure
   - Low: Missing headers, weak configuration
   - Info: Version disclosure, non-exploitable findings

2. **Report Template**
   ```markdown
   ## [Severity] - [Vulnerability Name]
   
   **Location:** URL or file path
   **Affected Component:** Authentication / API / Frontend / etc.
   
   **Description:**
   Brief description of the vulnerability.
   
   **Steps to Reproduce:**
   1. Step one
   2. Step two
   
   **Proof of Concept:**
   ```bash
   curl command or screenshot
   ```
   
   **Impact:**
   What can an attacker do with this?
   
   **Remediation:**
   Specific fix recommendations.
   
   **References:**
   - OWASP link
   - CVE if applicable
   ```

---

## XV. Quick Wins (Immediate Actions)

### High Priority

1. **Enable Security Headers**
   ```nginx
   # Add to nginx config
   add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
   add_header X-Content-Type-Options "nosniff" always;
   add_header X-Frame-Options "SAMEORIGIN" always;
   add_header Referrer-Policy "strict-origin-when-cross-origin" always;
   ```

2. **Review Django Settings**
   ```python
   # backend/config/settings/production.py
   SECURE_BROWSER_XSS_FILTER = True
   SECURE_CONTENT_TYPE_NOSNIFF = True
   SECURE_SSL_REDIRECT = True
   SESSION_COOKIE_SECURE = True
   CSRF_COOKIE_SECURE = True
   X_FRAME_OPTIONS = 'DENY'
   ```

3. **Run Dependency Audits**
   ```bash
   cd backend && pip-audit
   cd apps/web && npm audit fix
   ```

4. **Review CORS Settings**
   ```bash
   grep -A 10 "CORS_ALLOWED_ORIGINS" /home/reconraven/Documents/projects/koraa/backend/config/settings/base.py
   ```

5. **Check for Exposed Secrets**
   ```bash
   cd /home/reconraven/Documents/projects/koraa
   git log -p | grep -E "(SECRET_KEY|API_KEY|PASSWORD)" | grep -v ".example"
   ```

### Medium Priority

1. **Implement Content Security Policy**
2. **Add rate limiting to public endpoints**
3. **Enable Django security middleware**
4. **Review serializer field whitelists**
5. **Audit file upload handling**

### Long Term

1. **Set up automated security scanning (GitHub/GitLab CI)**
2. **Implement bug bounty program**
3. **Regular penetration testing (quarterly)**
4. **Security training for team**
5. **Disaster recovery testing**

---

## XVI. Emergency Response

### If You Find a Critical Vulnerability

1. **Immediate Actions:**
   - Document the vulnerability privately
   - Do NOT disclose publicly
   - Assess if it's actively exploited (check logs)
   - If yes, take affected service offline

2. **Mitigation:**
   - Deploy hotfix immediately
   - Rotate compromised credentials
   - Invalidate all JWT tokens if auth compromised
   - Notify affected users if data breach

3. **Post-Incident:**
   - Conduct root cause analysis
   - Update this checklist
   - Implement monitoring for similar issues
   - Document lessons learned

---

## XVII. Tools & Resources

### Security Testing Tools

**Browser Extensions:**
- Wappalyzer - Technology detection
- Cookie-Editor - Cookie manipulation
- ModHeader - Header modification
- WAVE - Accessibility/security

**Command Line:**
- curl - HTTP requests
- nmap - Port scanning
- nikto - Web scanner
- sqlmap - SQL injection
- wfuzz - Fuzzing
- gobuster - Directory enumeration

**Desktop Applications:**
- OWASP ZAP - Web app scanner
- Burp Suite Community - Proxy/scanner
- Postman - API testing
- Wireshark - Network analysis

### Learning Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [PortSwigger Web Security Academy](https://portswigger.net/web-security)
- [HackerOne Disclosure Guidelines](https://www.hackerone.com/disclosure-guidelines)

---

## XVIII. Testing Schedule

### Weekly
- [ ] Review failed login logs
- [ ] Check fail2ban ban list
- [ ] Review rate limit violations

### Monthly
- [ ] Run dependency audits (npm audit, pip-audit)
- [ ] Review new user registrations for anomalies
- [ ] Check SSL certificate expiration (60 days)

### Quarterly
- [ ] Full security audit using this checklist
- [ ] Penetration testing (staging environment)
- [ ] Review and update security policies
- [ ] Team security training

### Annually
- [ ] Third-party security audit
- [ ] Disaster recovery drill
- [ ] Review all third-party integrations
- [ ] Update incident response plan

---

## XIX. Sign-Off

**Auditor:** ___________________________  
**Date:** ___________________________  
**Findings Summary:** ___ Critical, ___ High, ___ Medium, ___ Low  
**Status:** ☐ Passed  ☐ Passed with Recommendations  ☐ Failed  

**Notes:**
_______________________________________________________
_______________________________________________________
_______________________________________________________

---

**End of Security Audit Checklist**

*Last Updated: 2024-10-04*  
*Next Review: Quarterly*
