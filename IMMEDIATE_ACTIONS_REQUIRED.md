# ⚠️ IMMEDIATE ACTIONS REQUIRED - Database Isolation Fix

## What Was the Problem?

Your local and staging environments were **connecting to the SAME MongoDB instance**, causing data cross-contamination where local data appeared in staging and vice versa.

## The Solution

**Use SEPARATE MongoDB instances for each environment.** Database names remain the same (`omni_master`, `tenant_xxx`), but each environment connects to its own MongoDB server.

```
✅ CORRECT APPROACH:
Local → mongodb://127.0.0.1:27017 → omni_master, tenant_xxx
Staging → mongodb://staging-host:27017 → omni_master, tenant_xxx
Production → mongodb://prod-host:27017 → omni_master, tenant_xxx

Database names are the SAME, but on DIFFERENT MongoDB instances!
```

## 🚨 CRITICAL ACTIONS - Do This NOW

### Step 1: Verify Current Connection (1 minute)

```bash
# Check where your LOCAL is connecting:
cd /home/zeeshan-ahmed/projects/my-app
grep MONGODB_URI .env.local
# Should output: MONGODB_URI=mongodb://127.0.0.1:27017 (or similar LOCAL address)

# Check NODE_ENV:
grep NODE_ENV .env.local
# Should output: NODE_ENV=development
```

### Step 2: Set Up Staging MongoDB (If Not Done)

**Option A: Use MongoDB Atlas (Recommended)**
1. Go to https://cloud.mongodb.com
2. Create a NEW cluster called "staging-cluster"
3. Get the connection string
4. Update staging server .env file

**Option B: Use Separate MongoDB Server**
1. Set up MongoDB on staging server (or separate server)
2. Ensure it's on a different host than local

### Step 3: Update Environment Files

#### On LOCAL Machine (.env.local):
```bash
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017
DATABASE_NAME=omni_master
```

#### On STAGING Server (.env or .env.production):
```bash
NODE_ENV=staging
MONGODB_URI=mongodb://your-staging-mongodb-host:27017
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@staging-cluster.mongodb.net
DATABASE_NAME=omni_master
```

### Step 4: Verify Isolation (2 minutes)

```bash
# On LOCAL:
npm run dev
# Check logs - should show: MongoDB Connected: 127.0.0.1

# On STAGING:
npm start
# Check logs - should show: MongoDB Connected: <staging-host>

# Verify they're different hosts!
```

### Step 5: Clean Up Mixed Data (Important!)

Since your environments were mixing data, you should clean up:

**On LOCAL MongoDB:**
```bash
mongosh
show dbs
# You'll see: omni_master, tenant_68e4690e..., tenant_69295c91...

# Option A: Keep all (they're now isolated anyway)
# No action needed

# Option B: Drop specific tenant databases you know are from staging
use tenant_STAGING_ID_HERE
db.dropDatabase()
```

**On STAGING MongoDB:**
```bash
# SSH to staging server
mongosh "mongodb://your-staging-host:27017"
show dbs

# Drop any databases that were from local
# (Check timestamps, data, etc. to identify them)
```

## Verification Checklist

After completing above steps:

- [ ] Local .env has `MONGODB_URI=mongodb://127.0.0.1:27017`
- [ ] Staging .env has different MONGODB_URI (different host!)
- [ ] NODE_ENV set correctly on each server
- [ ] Applications restarted
- [ ] Logs show different MongoDB hosts
- [ ] Register test company on each environment
- [ ] Verify databases created on correct MongoDB instance

## How to Test Isolation

### Test 1: Connection Verification

```bash
# LOCAL:
npm run dev | grep "MongoDB Connected"
# Should show: MongoDB Connected: 127.0.0.1

# STAGING (on staging server):
npm start | grep "MongoDB Connected"
# Should show: MongoDB Connected: <different-host>
```

### Test 2: Database Creation

```bash
# 1. Register company on LOCAL
# 2. Check local MongoDB:
mongosh
show dbs
# Note the tenant_xxx database created

# 3. Check staging MongoDB:
mongosh "mongodb://staging-host:27017"
show dbs
# Should NOT see the local tenant database!
```

## What Changed in the Code

### Updated Files:
1. **`src/config/database.js`**
   - Simplified to NOT use database name prefixes
   - Isolation through MONGODB_URI (separate instances)
   - Same database names across all environments

2. **`src/services/tenant/TenantService.js`**
   - Removed environment prefix logic
   - Simple `tenant_<companyId>` naming

### Removed Files:
- Old verification scripts (no longer needed)
- Old documentation suggesting prefixes

## Important Notes

1. **Database Names Stay the Same**
   - Master: `omni_master` (all environments)
   - Tenants: `tenant_<companyId>` (all environments)

2. **Isolation is via MONGODB_URI**
   - Different connection strings per environment
   - Physical/network separation

3. **No Application Logic for Isolation**
   - Clean, simple approach
   - Industry standard
   - Better security

## For Your Staging Server

```bash
# SSH to staging server
ssh user@staging-server

# Update .env file:
vi .env  # or nano .env

# Set:
NODE_ENV=staging
MONGODB_URI=mongodb://your-staging-mongodb-host:27017

# Restart application:
pm2 restart all
# or
npm run build && npm start

# Verify logs:
pm2 logs | grep "MongoDB Connected"
```

## MongoDB Atlas Setup (Recommended for Staging/Production)

### Advantages:
- Fully managed (no server maintenance)
- Automatic backups
- High availability
- Easy scaling
- Security features built-in

### Setup Steps:
1. Create account at https://cloud.mongodb.com
2. Create cluster: "staging-cluster"
3. Create database user
4. Whitelist staging server IP
5. Get connection string
6. Update staging .env with connection string
7. Repeat for production

### Cost:
- Free tier: M0 (good for testing)
- Staging: M10 (~$57/month)
- Production: M20+ (auto-scaling, ~$130/month+)

## Troubleshooting

### Problem: Still seeing mixed data
**Solution**: Verify MONGODB_URI is DIFFERENT on each server:
```bash
# On each server:
echo $MONGODB_URI
# They MUST be different hosts!
```

### Problem: Can't connect to MongoDB
**Check:**
- Is MongoDB running? `sudo systemctl status mongodb`
- Is connection string correct? `echo $MONGODB_URI`
- Firewall/security groups allow connection?
- Credentials correct?

### Problem: Application crashes on startup
**Check:**
- `.env` file exists in correct location
- MONGODB_URI is set and valid
- No typos in connection string
- MongoDB is accessible from app server

## Summary

✅ **What You Did:**
- Fixed AI bot to respond to all message types
- Fixed AI bot secret encryption
- Simplified database isolation approach

⚠️ **What You Need to Do:**
1. Verify MONGODB_URI is different on local vs staging
2. Set up separate MongoDB for staging (if not done)
3. Update .env files with correct values
4. Restart applications
5. Test isolation by creating companies on each environment

**Once complete, you'll have complete environment isolation!** 🎉

**Read full details in**: `CORRECT_DATABASE_ISOLATION_GUIDE.md`
