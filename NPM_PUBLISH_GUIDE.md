# Publishing @koraa/storefront-sdk to NPM

## Prerequisites

1. **NPM Account**
   - Create account at: https://www.npmjs.com/signup
   - Verify email

2. **Login to NPM**
   ```bash
   npm login
   ```
   - Enter username, password, email
   - Enter OTP if 2FA is enabled

## Steps to Publish

### 1. Prepare the Package

```bash
cd /home/reconraven/Documents/projects/koraa/packages/storefront-sdk

# Build the package
npm run build

# Test the build
npm pack --dry-run
```

### 2. Update package.json (if needed)

The package is currently configured as:
- **Name:** `@koraa/storefront-sdk`
- **Version:** `1.0.0`
- **Access:** Public (scoped package)

### 3. Publish to NPM

```bash
# First time publish (scoped package must be public)
npm publish --access public

# Or if you've published before
npm publish
```

### 4. Verify Publication

```bash
# Check if published
npm view @koraa/storefront-sdk

# Install in test project
npm install @koraa/storefront-sdk
```

## Version Management

### Update Version Before Publishing

```bash
# Patch version (1.0.0 -> 1.0.1)
npm version patch

# Minor version (1.0.0 -> 1.1.0)
npm version minor

# Major version (1.0.0 -> 2.0.0)
npm version major

# Then publish
npm publish
```

## Common Issues

### Issue: Package name already taken
**Solution:** Choose a different name or use a scope (@yourname/storefront-sdk)

### Issue: Need to verify email
**Solution:** Check your email and click verification link

### Issue: 2FA required
**Solution:** Enable 2FA in NPM settings and use authenticator app

### Issue: Not logged in
**Solution:** Run `npm login` first

## Post-Publication

### 1. Check NPM Page
Visit: https://www.npmjs.com/package/@koraa/storefront-sdk

### 2. Update Documentation
Add installation instructions to README:
```bash
npm install @koraa/storefront-sdk
```

### 3. Create GitHub Release
Tag the version in git:
```bash
git tag v1.0.0
git push origin v1.0.0
```

## Automated Publishing (Optional)

Create `.github/workflows/publish.yml`:
```yaml
name: Publish to NPM
on:
  release:
    types: [created]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Quick Publish Script

```bash
#!/bin/bash
# publish-sdk.sh

cd packages/storefront-sdk

echo "🏗️  Building SDK..."
npm run build

echo "📦 Packing for verification..."
npm pack --dry-run

echo "🚀 Ready to publish!"
echo ""
echo "Run: npm publish --access public"
```

---

**Current Package Info:**
- Name: @koraa/storefront-sdk
- Version: 1.0.0
- Description: Official SDK for building custom Koraa storefront templates
- License: MIT
