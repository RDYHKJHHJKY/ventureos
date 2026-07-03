# 🚀 VentureOS Deployment & SPR Integration Instructions

## Current Status
✅ **Build Complete**: `dist/` folder ready for deployment
✅ **Code Updated**: Branding and AI Assistant integrated
✅ **Changes Committed**: Latest commit includes all updates

---

## Deployment Options

### Option 1: Vercel (Recommended for Quick Deployment)

1. **Set up Git Remote:**
```bash
# If you haven't connected to a repo yet
git remote add origin https://github.com/YOUR_USERNAME/ventureos.git
git branch -M main
git push -u origin main
```

2. **Connect to Vercel:**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from project directory
vercel

# Follow prompts to:
# - Link to your GitHub repo
# - Configure environment variables
# - Deploy to production
```

3. **Environment Variables to Set in Vercel:**
```
DATABASE_URL=your_postgres_connection_string
NODE_ENV=production
VITE_PUBLIC_APP_URL=your_production_url
JWT_SECRET=your_jwt_secret
BCRYPT_ROUNDS=12
```

### Option 2: Docker Container

1. **Build Docker Image:**
```bash
docker build -t ventureos:latest .
```

2. **Run Container:**
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e NODE_ENV="production" \
  ventureos:latest
```

### Option 3: Node.js Direct (VPS/Server)

1. **Install Dependencies:**
```bash
npm ci --only=production
```

2. **Start Server:**
```bash
npm start
# or with PM2:
pm2 start server.js --name ventureos
```

---

## Immediate Next Steps: SPR Self-Integration (Priority Order)

### ⚡ QUICK START (1 hour): Phase 1 Core Setup

#### Step 1: Generate Cryptographic Keys
```bash
# Create keys directory
mkdir -p secure/keys secure/certs

# Generate RSA key pair
openssl genrsa -out secure/keys/platform-private.pem 2048
openssl rsa -in secure/keys/platform-private.pem -pubout -out secure/keys/platform-public.pem

# Generate self-signed certificate (for development)
openssl req -new -x509 -key secure/keys/platform-private.pem \
  -out secure/certs/platform-cert.pem -days 365
```

#### Step 2: Create Database Schema
```sql
-- Connect to your PostgreSQL database and run:
psql -U postgres -d ventureos -f db/schema-spr-self.sql
```

**Create file: `db/schema-spr-self.sql`**
```sql
CREATE TABLE IF NOT EXISTS self_audits (
  id SERIAL PRIMARY KEY,
  audit_date TIMESTAMP DEFAULT NOW(),
  audit_type VARCHAR(50),
  status VARCHAR(20),
  trust_score_impact INTEGER,
  findings JSONB,
  evidence_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_passports (
  id UUID PRIMARY KEY,
  passport_type VARCHAR(50),
  version INTEGER,
  trust_score DECIMAL(5,2),
  confidence DECIMAL(5,2),
  issued_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  signature VARCHAR(512),
  audit_trail JSONB,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50),
  entity_id UUID,
  verified_by_entity_id UUID,
  result VARCHAR(20),
  verification_method VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_self_audits_date ON self_audits(audit_date DESC);
CREATE INDEX idx_passports_expiry ON platform_passports(expires_at);
CREATE INDEX idx_verification_entity ON verification_events(entity_id);
```

#### Step 3: Update Environment Variables
Create `.env` with:
```env
# Existing vars...
DATABASE_URL=postgresql://user:password@localhost:5432/ventureos

# SPR Self-Integration
SPR_SELF_AUDIT_ENABLED=true
SPR_SELF_AUDIT_INTERVAL=86400
SPR_AUTO_PASSPORT_GENERATION=true

# Signing & Cryptography
SPR_SIGNING_ALGORITHM=RSA-SHA256
SPR_PRIVATE_KEY_PATH=/app/secure/keys/platform-private.pem
SPR_PUBLIC_KEY_PATH=/app/secure/keys/platform-public.pem
SPR_CERTIFICATE_PATH=/app/secure/certs/platform-cert.pem

# Trust Configuration
SPR_BASE_TRUST_SCORE=75
SPR_MAX_TRUST_SCORE=100
SPR_AUDIT_WEIGHT_CODE=0.25
SPR_AUDIT_WEIGHT_PERFORMANCE=0.15
SPR_AUDIT_WEIGHT_SECURITY=0.35
SPR_AUDIT_WEIGHT_COMPLIANCE=0.25

# Compliance Standards
SPR_COMPLIANCE_STANDARDS=ISO27001,SOC2,GDPR,NIST

# Passport Configuration
SPR_PASSPORT_VALIDITY_DAYS=90
SPR_PASSPORT_RENEWAL_THRESHOLD=7
```

#### Step 4: Create Self-Audit Engine (Copy from SPR_SELF_INTEGRATION_GUIDE.md)
Create file: `lib/spr/self-audit.js`
- Copy the complete SelfAuditEngine class from the guide
- Install dependencies: `npm install --save-dev eslint npm-audit`

#### Step 5: Create Passport Generator (Copy from Guide)
Create file: `lib/spr/passport-generator.js`
- Copy the complete PassportGenerator class from the guide

#### Step 6: Create API Routes
Create file: `api/spr/audit.js`
```javascript
import { Router } from 'express';
import { SelfAuditEngine } from '../../lib/spr/self-audit.js';

const router = Router();
const auditEngine = new SelfAuditEngine();

router.post('/trigger', async (req, res) => {
  try {
    const audit = await auditEngine.runCompleteAudit();
    res.json({ success: true, audit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM self_audits ORDER BY audit_date DESC LIMIT 30`
    );
    res.json({ audits: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### 🎯 PHASE 2 (Next 2 hours): Trust Verification

1. Create `lib/spr/trust-calculator.js` - Copy from guide
2. Add endpoints: `/api/verify/trust-claim`, `/api/trust-chain/:entityId`
3. Implement passport verification in UI

### 🏆 PHASE 3 (Next 4 hours): Full Integration

1. Create Dashboard component showing:
   - Current trust score
   - Audit history graph
   - Compliance status
   - Last verification timestamp

2. Add UI for:
   - Triggering manual audits
   - Viewing audit details
   - Downloading audit reports
   - Sharing verification badges

3. Implement auto-refresh of audit data

### 🚀 PHASE 4 (Final): Launch

1. Run initial audit: `POST /api/spr/audit/trigger`
2. Generate platform passport
3. Create embeddable badges for docs/website
4. Set up automated daily audits
5. Monitor trust scores in real-time

---

## Test Your Integration

```bash
# 1. Start the server
npm run dev

# 2. Test audit endpoint
curl -X POST http://localhost:5173/api/spr/audit/trigger

# 3. Check audit history
curl http://localhost:5173/api/spr/audit/history

# 4. Generate passport
curl -X POST http://localhost:5173/api/spr/passport/issue

# 5. Verify passport
curl http://localhost:5173/api/spr/passport/verify/[PASSPORT_ID]
```

---

## Production Deployment Checklist

- [ ] Database backups configured
- [ ] SSL/TLS certificates valid
- [ ] Signing keys stored in secure vault (HashiCorp Vault, AWS KMS, etc.)
- [ ] Environment variables set in production
- [ ] Monitoring/alerting configured
- [ ] Rate limiting enabled on audit endpoints
- [ ] Audit logs immutable and backed up
- [ ] Error handling tested
- [ ] Performance tested under load
- [ ] Security audit completed

---

## Troubleshooting

### SSL Certificate Issues
```bash
# Verify certificate
openssl x509 -in secure/certs/platform-cert.pem -text -noout

# Check expiry
openssl x509 -enddate -noout -in secure/certs/platform-cert.pem
```

### Database Connection Issues
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check tables exist
psql $DATABASE_URL -c "\dt"
```

### Audit Engine Errors
```bash
# Check logs
tail -f deployment.log

# Re-run audit with verbose output
DEBUG=spr:* npm run dev
```

---

## Support Resources

- **Full Integration Guide**: `SPR_SELF_INTEGRATION_GUIDE.md`
- **Branding Updates**: `BRANDING_UPDATES_SUMMARY.md`
- **API Reference**: `API_REFERENCE.md`
- **Architecture Docs**: `ARCHITECTURE/`

---

**You're ready to deploy! Choose your deployment option above and follow the steps.** 🚀

Need help? Check the troubleshooting section or review the full SPR_SELF_INTEGRATION_GUIDE.md

