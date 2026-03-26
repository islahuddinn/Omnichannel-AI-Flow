# 🔒 Database Isolation Guide - Separate MongoDB Instances

## The Right Way: Separate MongoDB Instances Per Environment

Your multi-tenant SaaS application achieves environment isolation through **SEPARATE MongoDB instances**, not database name prefixes.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ENVIRONMENT ISOLATION                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  LOCAL Environment                                           │
│  ├─ MONGODB_URI: mongodb://localhost:27017                  │
│  ├─ Database: omni_master                                    │
│  └─ Tenant DBs: tenant_67890..., tenant_12345...            │
│                                                              │
│  STAGING Environment                                         │
│  ├─ MONGODB_URI: mongodb://staging-host:27017               │
│  │                OR mongodb+srv://staging.mongodb.net       │
│  ├─ Database: omni_master                                    │
│  └─ Tenant DBs: tenant_67890..., tenant_12345...            │
│                                                              │
│  PRODUCTION Environment                                      │
│  ├─ MONGODB_URI: mongodb://prod-host:27017                  │
│  │                OR mongodb+srv://production.mongodb.net    │
│  ├─ Database: omni_master                                    │
│  └─ Tenant DBs: tenant_67890..., tenant_12345...            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Database Names (Same Across All Environments)

- **Master Database**: `omni_master`
- **Tenant Databases**: `tenant_<companyId>`

Example:
- `omni_master`
- `tenant_67890abcdef12345`
- `tenant_12345fedcba09876`

## Environment Configuration

### Local Development (.env.local or .env)

```bash
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017
DATABASE_NAME=omni_master

# Other settings...
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672
```

### Staging Server (.env on staging)

```bash
NODE_ENV=staging
MONGODB_URI=mongodb://your-staging-mongodb-host:27017
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@staging-cluster.mongodb.net
DATABASE_NAME=omni_master

# Other settings...
REDIS_URL=redis://staging-redis:6379
RABBITMQ_URL=amqp://staging-rabbitmq:5672
```

### Production Server (.env on production)

```bash
NODE_ENV=production
MONGODB_URI=mongodb://your-production-mongodb-host:27017
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@production-cluster.mongodb.net
DATABASE_NAME=omni_master

# Other settings...
REDIS_URL=redis://production-redis:6379
RABBITMQ_URL=amqp://production-rabbitmq:5672
```

## Why This Approach is Better

### ✅ Advantages:

1. **Complete Physical Isolation**
   - Each environment has its own MongoDB instance
   - No risk of accidental cross-environment access
   - Better security and compliance

2. **Simple Database Names**
   - Same naming convention across all environments
   - Easy to understand and maintain
   - No confusion with prefixes

3. **Performance Isolation**
   - Development queries don't affect production
   - Staging load testing doesn't impact prod
   - Independent scaling per environment

4. **Easier Backup & Recovery**
   - Separate backup schedules per environment
   - Can restore staging without affecting prod
   - Clear disaster recovery procedures

5. **Network-Level Security**
   - Production MongoDB can be on private network
   - Firewall rules isolate environments
   - VPN access for staging/production

### ❌ What NOT to Do:

Don't use the same MongoDB instance for multiple environments with these credentials:

```bash
# BAD - All environments sharing same MongoDB:
Local: mongodb://localhost:27017
Staging: mongodb://localhost:27017  ❌ SAME INSTANCE!
Production: mongodb://localhost:27017  ❌ SAME INSTANCE!
```

## The Problem You Had

You were experiencing cross-contamination because **both local and staging were connecting to the SAME MongoDB instance**. The fix is simple: **use separate MongoDB instances**.

### Before (Problem):
```
Local & Staging → Same MongoDB → Same databases → Cross-contamination! ❌
```

### After (Solution):
```
Local → Local MongoDB → omni_master, tenant_xxx ✅
Staging → Staging MongoDB → omni_master, tenant_xxx ✅
Production → Production MongoDB → omni_master, tenant_xxx ✅
```

## Setup Instructions

### Step 1: Set Up MongoDB Instances

#### Option A: Local Development - Use Local MongoDB
```bash
# Install MongoDB locally
# Ubuntu/Debian:
sudo apt-get install mongodb

# macOS:
brew install mongodb-community

# Windows: Download from mongodb.com

# Start MongoDB:
sudo systemctl start mongodb  # Linux
brew services start mongodb-community  # macOS
```

#### Option B: Use MongoDB Atlas (Recommended for Staging/Production)

1. Go to https://cloud.mongodb.com
2. Create **separate clusters** for each environment:
   - `staging-cluster`
   - `production-cluster`
3. Get connection strings for each cluster

### Step 2: Configure .env Files

#### Local (.env.local):
```bash
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017
DATABASE_NAME=omni_master
```

#### Staging (on staging server):
```bash
NODE_ENV=staging
MONGODB_URI=mongodb+srv://staging-user:password@staging-cluster.mongodb.net
DATABASE_NAME=omni_master
```

#### Production (on production server):
```bash
NODE_ENV=production
MONGODB_URI=mongodb+srv://prod-user:password@production-cluster.mongodb.net
DATABASE_NAME=omni_master
```

### Step 3: Verify Isolation

```bash
# On LOCAL machine:
npm run dev
# Should connect to: mongodb://127.0.0.1:27017

# On STAGING server:
npm start
# Should connect to: mongodb://staging-host:27017 (or Atlas)

# Check logs for:
# ✅ MongoDB Connected: <hostname>
# ✅ Environment Isolation: Via separate MongoDB instances
```

### Step 4: Test

1. **Register a company on LOCAL**
   - Check local MongoDB: `mongosh` → `show dbs`
   - Should see: `omni_master`, `tenant_xxx`

2. **Register a company on STAGING**
   - Check staging MongoDB: `mongosh "mongodb://staging-host:27017"` → `show dbs`
   - Should see: `omni_master`, `tenant_xxx`

3. **Verify they're different**
   - Company IDs will be different
   - Data completely isolated
   - No cross-contamination possible!

## Security Best Practices

### 1. Network Isolation

```bash
# Production MongoDB should NOT be accessible from internet
# Use:
# - Private VPC/Network
# - IP Whitelisting
# - VPN access only
# - Firewall rules
```

### 2. Separate Credentials

```bash
# Different MongoDB users per environment
Local: mongodb://local_user:local_pass@localhost:27017
Staging: mongodb://staging_user:staging_pass@staging-host:27017
Production: mongodb://prod_user:prod_pass@prod-host:27017
```

### 3. Access Control

- **Local**: Open access for development
- **Staging**: VPN/IP whitelist only
- **Production**: Highly restricted, VPN required, strong passwords

### 4. Backup Strategy

```bash
# Different backup schedules per environment:
Production: Every 1 hour + daily + weekly
Staging: Daily
Local: Optional (development data)
```

## MongoDB Atlas Setup (Recommended)

### Create Separate Clusters:

1. **Staging Cluster**
   - Region: Same as staging app server
   - Tier: M10 or higher (production workloads)
   - Backup: Enabled
   - IP Whitelist: Staging server IPs only

2. **Production Cluster**
   - Region: Same as production app server
   - Tier: M20 or higher (with auto-scaling)
   - Backup: Enabled, continuous backups
   - IP Whitelist: Production server IPs only
   - Private endpoint: Enabled

### Connection Strings:

```bash
# Staging
MONGODB_URI=mongodb+srv://staging_user:password@staging-cluster.abc123.mongodb.net

# Production
MONGODB_URI=mongodb+srv://prod_user:password@prod-cluster.xyz789.mongodb.net
```

## Troubleshooting

### Problem: Still seeing cross-contamination

**Check:**
```bash
# On each server, verify MONGODB_URI:
echo $MONGODB_URI

# They should be DIFFERENT!
Local: mongodb://127.0.0.1:27017
Staging: mongodb://staging-host:27017 (different!)
Production: mongodb://prod-host:27017 (different!)
```

### Problem: Can't connect to MongoDB

**Check:**
1. MongoDB is running: `sudo systemctl status mongodb`
2. Connection string is correct: `echo $MONGODB_URI`
3. Network access (firewalls, security groups)
4. Credentials are correct

### Problem: Same database appears in multiple environments

**This means you're still using the same MongoDB instance!**

**Solution:**
- Set up separate MongoDB instances
- Update MONGODB_URI in .env files
- Restart applications
- Verify with `mongosh` on each environment

## Quick Verification Checklist

- [ ] Local MONGODB_URI points to localhost or local MongoDB
- [ ] Staging MONGODB_URI points to staging MongoDB (different host)
- [ ] Production MONGODB_URI points to production MongoDB (different host)
- [ ] NODE_ENV is set correctly on each server
- [ ] Application logs show correct MongoDB host on startup
- [ ] Registering a company creates databases on correct MongoDB instance
- [ ] No databases from other environments visible

## Summary

✅ **Correct Approach:**
- Separate MongoDB instances per environment
- Same database names across environments
- Isolation through network/infrastructure
- Simple, clear, professional

❌ **Wrong Approach:**
- Shared MongoDB instance
- Database name prefixes for isolation
- Relying on application logic for separation
- Risk of cross-contamination

**Your current setup should now be:**
```
Local: mongodb://127.0.0.1:27017 → omni_master, tenant_xxx
Staging: mongodb://staging-host:27017 → omni_master, tenant_xxx
Production: mongodb://prod-host:27017 → omni_master, tenant_xxx
```

**All database names are the same, but they're on DIFFERENT MongoDB instances!** 🎉

