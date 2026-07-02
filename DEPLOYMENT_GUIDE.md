rsyr6ysfer# 🚀 VentureOS Deployment Guide

> Turn VentureOS into a live production multi-tenant SPR trust platform

## 📊 Current State

✅ **Build Ready**: Frontend bundle generated (549.51 kB JS, 147.11 kB gzip)  
✅ **Backend Ready**: API routes configured for serverless deployment  
✅ **Tests Passing**: Regression suite validates all key workflows  
✅ **Dashboard Complete**: Executive CEO command center built and integrated  

---

## 🎯 Quick Start: Deploy to Vercel in 5 Minutes

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
vercel login
```

### Step 2: Connect This Project
```bash
cd /path/to/ventureos
vercel link
# Follow prompts to create or link Vercel project
```

### Step 3: Set Environment Variables
Open your Vercel project dashboard → **Settings → Environment Variables** and add:

| Variable | Value | Example |
|----------|-------|---------|
| `DATABASE_URL` | Production PostgreSQL URL | `postgresql://user:pass@host:5432/ventureos` |
| `NODE_ENV` | `production` | `production` |
| `APP_URL` | Your Vercel domain | `https://ventureos.vercel.app` |
| `SESSION_SECRET` | Random 32-char string | `$(openssl rand -base64 32)` |
| `VENTUREOS_BUNDLE_MASTER_KEY` | Custom security key | Generate custom value |

**No DATABASE_URL?** The app will fall back to JSON file storage (`.data/ventureos-db.json`), but data won't persist across redeploys. We **strongly recommend** setting up a PostgreSQL database.

### Step 4: Deploy
```bash
vercel deploy --prod
```

### Step 5: Verify
```bash
# Health check
curl https://your-vercel-url/api/health

# Expected response:
# {"ok":true,"uptime":...}
```

---

## 🗄️ Database Setup (Recommended for Production)

### Option A: Azure Database for PostgreSQL (Recommended)
```bash
# 1. Create via Azure CLI
az postgres server create \
  --resource-group myResourceGroup \
  --name ventureos-db \
  --admin-user ventureos \
  --admin-password <secure-password> \
  --sku-name B_Gen5_1

# 2. Get connection string
CONNECTION_STRING=$(az postgres server show-connection-string \
  --resource-group myResourceGroup \
  --name ventureos-db \
  --admin-user ventureos)

# 3. Set as Vercel environment variable
vercel env add DATABASE_URL $CONNECTION_STRING
```

### Option B: AWS RDS PostgreSQL
```bash
# 1. Create RDS instance via AWS Console or CLI
aws rds create-db-instance \
  --db-instance-identifier ventureos-db \
  --db-instance-class db.t2.micro \
  --engine postgres \
  --master-username ventureos \
  --master-user-password <secure-password>

# 2. Wait for instance to be available (5-10 min)
# 3. Get endpoint and create connection string
# postgresql://ventureos:password@endpoint:5432/ventureos

# 4. Set as Vercel environment variable
vercel env add DATABASE_URL "postgresql://..."
```

### Option C: Local PostgreSQL (Dev/Testing Only)
```bash
# Run schema against your local database
psql -h localhost -U ventureos -d ventureos < db/schema.sql
```

---

## ✅ Post-Deployment Validation

### Run Full Endpoint Validation Suite
```bash
npm run test:deploy:all -- https://your-vercel-url
```

This tests:
- ✓ Authentication flows (login, session)
- ✓ Asset management (CRUD)
- ✓ Workspace operations
- ✓ MSP dashboard metrics
- ✓ SPR passport workflows
- ✓ Trust scoring

### Manual Smoke Test
```bash
# Health check
curl https://your-url/api/health

# Test demo login (if enabled)
curl -X POST https://your-url/api/demo/login \
  -H "Content-Type: application/json" \
  -d '{"mspId":"demo"}'

# Test session
curl https://your-url/api/auth/session \
  -H "Cookie: <session-cookie-from-above>"

# List assets
curl https://your-url/api/assets
```

### Test CEO Dashboard
1. Navigate to `https://your-vercel-url` in browser
2. You should see:
   - Executive metrics (assets under watch, average trust, high-risk signals)
   - Growth pulse section
   - "What to do next" recommendations
   - Recent analyses timeline
   - Board-level alerts

---

## 🔄 Continuous Deployment

### Auto-Deploy on Git Push (Recommended)
1. Connect your GitHub repo to Vercel in the dashboard
2. Set branch auto-deployment (e.g., `main` → production)
3. Every push to main automatically redeploys

### Manual Redeploy
```bash
vercel deploy --prod
```

### Rollback to Previous Deployment
```bash
vercel rollback
```

---

## 🐛 Troubleshooting

### "DATABASE_URL not set" → Data Lost on Redeploy
**Problem**: App falls back to JSON file storage; data is cleared when container restarts  
**Solution**: Set `DATABASE_URL` to production PostgreSQL connection string

### "Can't connect to API from frontend" → CORS Error
**Problem**: Frontend can't reach backend API  
**Solution**: Ensure `APP_URL` in environment variables matches your Vercel domain exactly  
**Example**: If deployed at `https://myapp.vercel.app`, set `APP_URL=https://myapp.vercel.app`

### "High cold start latency" → Slow First Request
**Problem**: First request after deploy takes 5-15 seconds  
**Why**: Vercel serverless functions have cold start overhead  
**Solution**: Upgrade to Vercel Pro for better performance

### "Session lost after redeploy" → SESSION_SECRET Mismatch
**Problem**: Users logged out after new deployment  
**Solution**: Ensure `SESSION_SECRET` is set in Vercel environment (persistent across deployments)

### "502 Bad Gateway" → Function Error
1. Check Vercel logs: `vercel logs --follow`
2. Verify `DATABASE_URL` and other environment variables are set
3. Test locally: `npm run dev` then `curl http://localhost:5173/api/health`

---

## 📈 Monitoring & Performance

### View Live Logs
```bash
vercel logs --follow
```

### Check Deployment Status
```bash
vercel deployments
vercel inspect <deployment-url>
```

### Monitor in Dashboard
1. Go to Vercel dashboard → Your project
2. View **Analytics** for request patterns
3. View **Logs** for errors and performance
4. Set up alerts for error rate spikes

---

## 🔐 Security Checklist

Before going to production:

- [ ] `SESSION_SECRET` is a strong random string (not default)
- [ ] `VENTUREOS_BUNDLE_MASTER_KEY` is rotated from default
- [ ] `DATABASE_URL` uses secure credentials (not hardcoded in code)
- [ ] PostgreSQL database has TLS encryption enabled
- [ ] CORS is properly configured (not `*`)
- [ ] API rate limiting is enabled (if needed)
- [ ] Sensitive logs are not exposed in Vercel logs

---

## 📦 What Gets Deployed

### Static Files (Frontend)
- `dist/` → Vercel CDN (all `.html`, `.js`, `.css`)
- Served from edge locations for low latency

### Serverless Functions (Backend)
- `api/[...all].js` → Routes all `/api/*` requests
- Handles auth, MSP dashboard, SPR workflows, etc.
- Scales automatically based on load

### Environment Persistence
- Database: Lives in PostgreSQL (persists across deploys)
- Sessions: Live in browser cookies + database
- Static files: Cached by CDN

---

## 🎉 You're Live!

Once deployed, you can:
1. **Share your URL** with stakeholders
2. **Access CEO Dashboard** to see live metrics
3. **Invite MSP members** to workspaces
4. **Monitor software trust** in real-time
5. **Generate compliance reports** on demand

---

## 🆘 Need Help?

- **Check logs**: `vercel logs --follow`
- **Review errors**: Vercel dashboard → Deployments → [Your deployment] → Logs
- **Test locally first**: `npm run dev` then `npm run test:ci`
- **Read API docs**: See `API_REFERENCE.md` in this project

---

## 📞 Next Steps

1. ✅ **Complete**: Build (`npm run build`)
2. ✅ **Complete**: Tests (`npm run test:ci`)
3. 🔄 **Next**: Set up PostgreSQL database (if not done)
4. 🔄 **Next**: Deploy to Vercel (`vercel deploy --prod`)
5. 🔄 **Next**: Run validation (`npm run test:deploy:all`)
6. 🔄 **Next**: Share deployed URL with team

---

**Ready to launch? Run**: `vercel deploy --prod` 🚀
