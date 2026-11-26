# SSH Key Quick Reference

**Created:** 2024-11-26

---

## 🔑 Your SSH Keys

### Private Key (KEEP SECRET!)
**Location:** `/home/reconraven/.ssh/deploy_key`
**Permissions:** `600` (-rw-------) ✅ CORRECT
**Status:** ✅ Secured, never committed to git

⚠️ **NEVER share, copy, or expose this file!**

### Public Key (Safe to Share)
**Location:** `/home/reconraven/.ssh/deploy_key.pub`
**Permissions:** `644` (-rw-r--r--) ✅ CORRECT

**Your public key:**
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBPpUDcwqc/brySAfdPZrBewGt7+TwqfmHcASx0ukBoO vscode-push
```

---

## 📋 How to Add to GitHub

### Step 1: Copy the PUBLIC key
```bash
cat ~/.ssh/deploy_key.pub
```

### Step 2: Add to GitHub
1. Go to: https://github.com/guyasong7/Koraa/settings/keys
2. Click **"Add deploy key"**
3. Paste the public key (from above)
4. Title: `Koraa Deploy Key`
5. ☑️ Check "Allow write access" (if you need to push)
6. Click **"Add key"**

### Step 3: Configure SSH
```bash
# Add to SSH config
cat >> ~/.ssh/config << 'EOF'

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/deploy_key
    IdentitiesOnly yes
EOF
```

### Step 4: Test Connection
```bash
ssh -T git@github.com
# Should output: Hi guyasong7! You've successfully authenticated...
```

---

## ✅ Security Status

- [x] Private key has correct permissions (600)
- [x] Private key never committed to git
- [x] Using modern ED25519 algorithm
- [x] Separate from personal SSH key
- [ ] Added to GitHub (do this now)
- [ ] SSH config configured (do this now)
- [ ] Connection tested (do this now)

---

## 🛠️ Common Commands

### View public key
```bash
cat ~/.ssh/deploy_key.pub
```

### Test GitHub connection
```bash
ssh -T git@github.com
```

### Check which key is being used
```bash
ssh -vT git@github.com 2>&1 | grep "identity file"
```

### Use specific key for git command
```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/deploy_key" git push
```

---

## 🔄 If You Need to Rotate This Key

```bash
# 1. Generate new key pair
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key_new -C "vscode-push-new"

# 2. Add new public key to GitHub
cat ~/.ssh/deploy_key_new.pub

# 3. Update SSH config to use new key
sed -i 's/deploy_key/deploy_key_new/g' ~/.ssh/config

# 4. Test new key
ssh -T git@github.com

# 5. Remove old key from GitHub

# 6. Delete old key files
rm ~/.ssh/deploy_key ~/.ssh/deploy_key.pub

# 7. Rename new key
mv ~/.ssh/deploy_key_new ~/.ssh/deploy_key
mv ~/.ssh/deploy_key_new.pub ~/.ssh/deploy_key.pub
```

**Next rotation date:** 2025-05-26 (6 months) or 2025-11-26 (12 months)

---

## 🚨 If Private Key is Compromised

If your private key is ever compromised (leaked, stolen, etc.):

1. **Immediately revoke on GitHub:**
   - GitHub → Repository → Settings → Deploy keys → Delete

2. **Generate new key:**
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -C "vscode-push"
   ```

3. **Add new public key to GitHub**

4. **Delete old private key:**
   ```bash
   shred -u ~/.ssh/deploy_key.old  # Secure deletion
   ```

---

## 📖 Related Documentation

- **DEPLOY_KEY_SECURITY.md** - Full security assessment
- **GITHUB_SECURITY_SCAN.md** - Git history analysis
- **SECURITY_SUMMARY.md** - Overall security status

---

**Remember:** 
- ✅ Public key (`.pub`) = Safe to share
- 🔒 Private key = NEVER share, keep at 600 permissions

---

**Last Updated:** 2024-11-26
