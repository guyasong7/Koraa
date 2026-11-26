# NPM Publish - 2FA Required

## Issue
NPM requires 2FA (two-factor authentication) to publish packages.

## Solution Options

### Option 1: Enable 2FA (Recommended)

1. **Go to NPM Settings:**
   - Visit: https://www.npmjs.com/settings/YOUR_USERNAME/tfa
   - Or: https://www.npmjs.com/settings/YOUR_USERNAME/profile

2. **Enable 2FA:**
   - Choose "Authorization and Publishing" (requires 2FA for publishing)
   - Use an authenticator app (Google Authenticator, Authy, etc.)
   - Scan QR code or enter secret key

3. **Save Recovery Codes:**
   - NPM will show recovery codes
   - Save them in a safe place

4. **Publish with 2FA:**
   ```bash
   npm publish --access public --otp=123456
   ```
   Replace `123456` with the code from your authenticator app

### Option 2: Use Automation Token (For CI/CD)

1. **Create Automation Token:**
   - Visit: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Click "Generate New Token"
   - Select "Automation" type
   - Copy the token (starts with `npm_...`)

2. **Use Token to Publish:**
   ```bash
   npm config set //registry.npmjs.org/:_authToken YOUR_TOKEN_HERE
   npm publish --access public
   ```

### Option 3: Bypass 2FA with Granular Access Token

1. **Create Granular Token:**
   - Visit: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Click "Generate New Token" → "Granular Access Token"
   - **Enable:** "Bypass 2FA requirement"
   - Set expiration (e.g., 30 days)
   - Select packages: `@koraa/storefront-sdk`
   - Copy token

2. **Login with Token:**
   ```bash
   npm logout
   npm login --auth-type=legacy
   # When prompted for password, paste the token
   ```

3. **Publish:**
   ```bash
   npm publish --access public
   ```

---

## Recommended: Quick Publish with 2FA

**Easiest approach:**

1. **Install authenticator app** on your phone (Google Authenticator or Authy)

2. **Enable 2FA:**
   - Visit: https://www.npmjs.com/settings/YOUR_USERNAME/tfa
   - Follow setup instructions

3. **Publish with OTP:**
   ```bash
   cd /home/reconraven/Documents/projects/koraa/packages/storefront-sdk
   
   # Get code from authenticator app (e.g., 123456)
   npm publish --access public --otp=XXXXXX
   ```

Replace `XXXXXX` with the 6-digit code from your authenticator app.

---

## Commands Summary

### With 2FA Enabled:
```bash
npm publish --access public --otp=123456
```

### With Automation Token:
```bash
npm config set //registry.npmjs.org/:_authToken npm_YOURTOKEN
npm publish --access public
```

### With Granular Token:
```bash
npm login --auth-type=legacy
npm publish --access public
```

---

## Verify After Publishing

```bash
# Check if published
npm view @koraa/storefront-sdk

# Install to test
npm install @koraa/storefront-sdk
```

---

**Recommendation:** Use 2FA with `--otp` flag - it's the most secure and straightforward.
