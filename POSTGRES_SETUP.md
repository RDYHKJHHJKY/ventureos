# PostgreSQL Setup Guide - Feature #2

Complete guide to set up PostgreSQL for VentureOS production deployment.

## Overview

VentureOS now supports PostgreSQL for persistent data storage. This replaces the file-based JSON storage with a robust, scalable relational database.

**What's included:**
- Complete database schema (20+ tables)
- Connection pool with automatic retry
- Session management
- User authentication
- Multi-tenant workspace support

## Prerequisites

### Option 1: Local PostgreSQL

#### macOS (Homebrew)
```bash
brew install postgresql@15
brew services start postgresql@15
createuser ventureos
createdb -O ventureos ventureos
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get install postgresql postgresql-contrib
sudo -u postgres createuser ventureos
sudo -u postgres createdb -O ventureos ventureos
```

#### Windows (Install from postgresql.org)
```bash
# Download and install from https://www.postgresql.org/download/windows/
# During installation, remember the superuser password
# Then in PowerShell:
psql -U postgres
# In psql:
CREATE USER ventureos PASSWORD 'password';
CREATE DATABASE ventureos OWNER ventureos;
```

#### Docker
```bash
docker run -d \
  --name ventureos-postgres \
  -e POSTGRES_USER=ventureos \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=ventureos \
  -p 5432:5432 \
  postgres:15
```

### Option 2: Azure Database for PostgreSQL

```bash
# Create resource group
az group create \
  --name ventureos \
  --location eastus

# Create PostgreSQL server
az postgres server create \
  --resource-group ventureos \
  --name ventureos-db \
  --location eastus \
  --admin-user dbadmin \
  --admin-password YourStrongPassword123! \
  --sku-name B_Gen5_1 \
  --storage-size 51200

# Create database
az postgres db create \
  --resource-group ventureos \
  --server-name ventureos-db \
  --name ventureos

# Get connection string
az postgres server connection-string show \
  --server-name ventureos-db \
  --admin-user dbadmin
```

## Installation Steps

### 1. Install Dependencies

```bash
npm install pg bcrypt dotenv express
```

**What these do:**
- `pg` - PostgreSQL driver
- `bcrypt` - Secure password hashing
- `dotenv` - Environment variable management
- `express` - Web framework (if not already installed)

### 2. Create Environment File

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your database connection:

```bash
# Local PostgreSQL
DATABASE_URL=postgresql://ventureos:password@localhost:5432/ventureos

# OR Azure Database for PostgreSQL
DATABASE_URL=postgresql://dbadmin@ventureos-db:password@ventureos-db.postgres.database.azure.com:5432/ventureos?sslmode=require
```

### 3. Verify Database Connection

```bash
# Test the connection string directly
psql $DATABASE_URL

# If this works, you'll see the psql prompt:
psql (15.0, server 15.x)
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

ventureos=>
```

### 4. Run Database Migration

```bash
node scripts/db-setup.js
```

This will:
- ✅ Connect to PostgreSQL
- ✅ Create all 20+ tables
- ✅ Create indexes for performance
- ✅ Set up foreign key relationships

**Expected output:**
```
🌟 VentureOS Database Setup
=============================

🔍 Checking database connection...
✅ Connected to database

📦 Reading schema file...
🚀 Running database migration...
✅ Database migration completed successfully!

📊 Created tables:
  • users
  • workspaces
  • workspace_members
  • sessions
  • assets
  • scan_runs
  • findings
  • passports
  • ...and more

🎉 Database is ready to use!
```

### 5. Verify Tables

```bash
psql $DATABASE_URL

# In psql:
\dt  # List all tables
\d users  # Describe users table

# Check row count
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM workspaces;
```

## Database Schema Overview

### Core Tables

**users** - User accounts
```
id (UUID)           - Primary key
email (VARCHAR)     - Unique email address
password_hash       - Bcrypt hash
name                - User display name
created_at          - Account creation time
updated_at          - Last update time
```

**workspaces** - Isolated data containers
```
id (UUID)           - Primary key
owner_id (FK)       - User who created it
name                - Workspace name
plan                - Pricing plan (starter, pro, enterprise)
active              - Is workspace active?
created_at, updated_at
```

**workspace_members** - Access control
```
id (UUID)
workspace_id (FK)   - Which workspace
user_id (FK)        - Which user
role                - owner, admin, member, viewer
created_at
```

**sessions** - Authentication tokens
```
id (VARCHAR)        - Session token
user_id (FK)        - Who this session is for
workspace_id (FK)   - Active workspace
expires_at          - When session expires
created_at, updated_at
```

**assets** - Things to analyze (repos, packages, etc.)
```
id (UUID)
workspace_id (FK)   - Which workspace owns it
name                - Asset name
canonical_url       - GitHub/NPM/PyPI URL
asset_type          - github_repo, npm_package, etc.
latest_trust_score  - Most recent scan result
created_at, updated_at
```

**scan_runs** - Security scan results
```
id (UUID)
asset_id (FK)       - What was scanned
workspace_id (FK)   - Who ran the scan
status              - pending, in_progress, completed
trust_score         - 0-100 score
verdict             - TRUSTED, CONDITIONALLY_TRUSTED, etc.
started_at, completed_at
```

**findings** - Individual security issues
```
id (UUID)
scan_run_id (FK)    - Which scan
severity            - critical, high, medium, low
title               - Issue title
detail              - Issue description
engine              - Which scanner found it (github, snyk, etc.)
created_at
```

**passports** - Issued trust credentials
```
id (UUID)
asset_id (FK)
scan_run_id (FK)
asset_name          - What was scanned
trust_score         - Final score
verdict             - TRUSTED, etc.
status              - active, revoked
public              - Is this publicly shareable?
issued_at, revoked_at
```

### Additional Tables

- **projects** - MSP projects
- **artifacts** - Project attachments
- **signals** - Scoring signals
- **msps** - Managed service providers
- **msp_members** - MSP team members
- **msp_workspaces** - MSP client workspaces
- **billing_events** - Usage events for billing
- **events** - Audit trail
- **webhooks** - External integrations
- **webhook_deliveries** - Webhook execution history
- **jobs** - Async job queue
- **audit_logs** - User action history

## Testing the Database

### Create a Test User

```bash
psql $DATABASE_URL

-- In psql:
INSERT INTO users (email, password_hash, name)
VALUES (
  'test@example.com',
  '$2b$10$...',  -- bcrypt hash
  'Test User'
);

SELECT * FROM users;
```

### Create a Test Workspace

```bash
-- Get the user ID first
SELECT id FROM users WHERE email = 'test@example.com';

-- Create workspace (replace {user-id} with actual UUID)
INSERT INTO workspaces (owner_id, name, plan)
VALUES ('{user-id}'::uuid, 'Test Workspace', 'starter')
RETURNING *;
```

### Create an Asset

```bash
INSERT INTO assets (workspace_id, name, canonical_url, asset_type, company)
VALUES (
  '{workspace-id}'::uuid,
  'torvalds/linux',
  'https://github.com/torvalds/linux',
  'github_repo',
  'Linux Foundation'
)
RETURNING *;
```

## Troubleshooting

### Connection Refused
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**
- Ensure PostgreSQL is running: `pg_ctl status` or `brew services list`
- Start PostgreSQL: `brew services start postgresql@15` or `docker start ventureos-postgres`

### Authentication Failed
```
Error: FATAL: password authentication failed for user "ventureos"
```

**Solution:**
- Check DATABASE_URL has correct username and password
- Verify user exists: `psql -U postgres -l`
- Reset password: `ALTER USER ventureos PASSWORD 'newpassword';`

### Database Does Not Exist
```
FATAL: database "ventureos" does not exist
```

**Solution:**
- Create database: `createdb -O ventureos ventureos`
- Or run migration script: `node scripts/db-setup.js`

### SSL/TLS Errors (Azure)
```
Error: self signed certificate
```

**Solution:**
- Add `sslmode=require` to DATABASE_URL for Azure
- Or disable: `?sslmode=disable` (development only)

### Migration Script Fails

**Solution:**
1. Check DATABASE_URL is set: `echo $DATABASE_URL`
2. Manually run migration: `psql $DATABASE_URL -f db/schema.sql`
3. Check SQL syntax: `cat db/schema.sql | head -50`
4. Review error: `node scripts/db-setup.js 2>&1 | tail -20`

## Performance Optimization

### Connection Pooling
Already configured in `lib/server/db.js`:
- Max 20 concurrent connections
- 30 second idle timeout
- Automatic reconnection

### Indexes
Schema includes optimized indexes:
- `users(email)` - Fast email lookups
- `assets(workspace_id)` - Fast asset queries
- `scan_runs(status)` - Fast job lookups
- `sessions(expires_at)` - Auto-cleanup

### Cleanup Old Sessions
```bash
# Manually clean expired sessions
psql $DATABASE_URL

-- In psql:
DELETE FROM sessions WHERE expires_at < NOW();
```

To automate, add to cron:
```bash
0 0 * * * psql $DATABASE_URL -c "DELETE FROM sessions WHERE expires_at < NOW();"
```

## Backup & Recovery

### Create Backup
```bash
pg_dump $DATABASE_URL > ventureos-backup.sql

# Compressed backup
pg_dump $DATABASE_URL | gzip > ventureos-backup.sql.gz
```

### Restore from Backup
```bash
# Drop and recreate database (careful!)
dropdb -U postgres ventureos
createdb -U postgres ventureos

# Restore
psql $DATABASE_URL < ventureos-backup.sql
```

### Azure Automated Backups
Already enabled:
- Daily backups kept for 7 days
- Access via Azure Portal > Backup + Restore

## Migration from JSON Storage

If migrating from file-based storage:

```bash
# Backup existing data
cp .data/ventureos-db.json .data/ventureos-db.json.backup

# Run migration script
node scripts/db-setup.js

# (Optional) Import existing data - script coming in next feature
node scripts/migrate-json-to-postgres.js
```

## Next Steps

✅ Database is now ready!

Next feature: **Backend API Endpoints**
- [ ] Create `/api/auth/login` endpoint
- [ ] Create `/api/auth/signup` endpoint
- [ ] Create `/api/auth/logout` endpoint
- [ ] Create `/api/auth/session` endpoint
- [ ] Implement password hashing with bcrypt
- [ ] Add CSRF token generation
- [ ] Test auth flow end-to-end

**Estimated time**: 4-6 hours

See [API_REFERENCE.md](../API_REFERENCE.md) for endpoint specifications.

## Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [pg (Node.js) Documentation](https://node-postgres.com/)
- [Bcrypt Documentation](https://www.npmjs.com/package/bcrypt)
- [Azure Database for PostgreSQL](https://learn.microsoft.com/en-us/azure/postgresql/)
