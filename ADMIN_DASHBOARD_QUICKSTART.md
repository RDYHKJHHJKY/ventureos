# 🔐 Admin Dashboard - 5-Minute Setup

Quick start guide for deploying the hidden admin dashboard.

## What You Have

✅ **Frontend Component**
- `src/components/AdminDashboard/AdminDashboard.jsx` (25KB)
- `src/components/AdminDashboard/AdminDashboard.css` (19KB)
- Full UI with 6 tabs

✅ **Backend API**
- `api/admin/dashboard.js` (17KB)
- 18 endpoints for all operations
- Database query functions

✅ **Database Schema**
- `db/schema-admin-dashboard.sql` (16KB)
- 18 tables + 11 indices + 3 views
- Production-ready structure

✅ **Documentation**
- `ADMIN_DASHBOARD_GUIDE.md` (14KB)
- Complete integration guide
- Security best practices

---

## Step 1: Initialize Database (2 min)

```bash
# Connect to your PostgreSQL database
psql $DATABASE_URL -f db/schema-admin-dashboard.sql

# Verify it worked
psql $DATABASE_URL -c "SELECT * FROM admin_dashboard_stats;"
```

---

## Step 2: Add Admin User (1 min)

```sql
-- Log into your database
psql $DATABASE_URL

-- Add yourself as super_admin
INSERT INTO admin_users (user_id, admin_level, access_modules)
VALUES (
  'YOUR_USER_ID_HERE',
  'super_admin',
  ARRAY['overview', 'users', 'financial', 'referrals', 'reviews', 'monitoring']
);

-- Verify
SELECT * FROM admin_users;
```

---

## Step 3: Import Component (1 min)

In your main `App.jsx`:

```jsx
import AdminDashboard from './components/AdminDashboard/AdminDashboard';

// Add state
const [showAdminDash, setShowAdminDash] = useState(false);
const adminId = localStorage.getItem('adminId');

// Add keyboard shortcut
useEffect(() => {
  const handleKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
      setShowAdminDash(!showAdminDash);
    }
  };
  window.addEventListener('keydown', handleKey);
  return () => window.removeEventListener('keydown', handleKey);
}, [showAdminDash]);

// In JSX return
{adminId && showAdminDash && (
  <AdminDashboard 
    adminId={adminId} 
    onClose={() => setShowAdminDash(false)} 
  />
)}
```

---

## Step 4: Add API Routes (1 min)

In your Express server:

```javascript
import adminController from './api/admin/dashboard.js';

const router = express.Router();

// All routes protected with token verification
router.use(adminController.verifyAdminToken);

router.get('/dashboard-stats', adminController.getDashboardStats);
router.get('/system-health', adminController.getSystemHealth);
router.post('/system-health', adminController.updateSystemHealth);
router.get('/transactions', adminController.getTransactions);
router.get('/analytics', adminController.getUserAnalytics);
router.post('/events', adminController.logUserEvent);
router.get('/reviews', adminController.getReviews);
router.post('/reviews/:id/respond', adminController.respondToReview);
router.get('/referrals', adminController.getReferrals);
router.post('/referrals/:id/status', adminController.updateReferralStatus);
router.get('/errors', adminController.getErrorLogs);
router.post('/errors', adminController.logError);
router.get('/performance', adminController.getPerformanceMetrics);
router.post('/performance', adminController.logPerformanceMetric);
router.get('/audit-log', adminController.getAdminAuditLog);
router.get('/revenue-summary', adminController.getRevenueSummary);
router.get('/referrers/top', adminController.getTopReferrers);

app.use('/api/admin', router);
```

---

## Step 5: Test It (1 min)

### Access Dashboard
- **Windows/Linux**: Press `Ctrl + Shift + A`
- **Mac**: Press `Cmd + Shift + A`

### Test API
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_ID" \
  http://localhost:3000/api/admin/dashboard-stats
```

---

## 📊 Dashboard Tabs

| Tab | Purpose | What You See |
|-----|---------|------------|
| **Overview** | System at a glance | Active users, revenue, health |
| **Users** | Manage users | Sessions, activity, subscriptions |
| **Financial** | Money tracking | Revenue, transactions, refunds |
| **Referrals** | Referral program | Approvals, rewards, leaderboard |
| **Reviews** | User feedback | Ratings, comments, responses |
| **Monitoring** | System health | Errors, performance, uptime |

---

## 🔐 Security Notes

1. **Only you can access** - Uses `Ctrl+Shift+A` shortcut
2. **JWT protected** - All endpoints verify token
3. **Admin role required** - Database checks admin_level
4. **Audit trail** - All actions logged in admin_audit_log
5. **No public data exposed** - Only admins see this

---

## 🎯 Common Tasks

### View All Active Users
```bash
curl -H "Authorization: Bearer YOUR_ID" \
  http://localhost:3000/api/admin/analytics
```

### Check Revenue
```bash
curl -H "Authorization: Bearer YOUR_ID" \
  http://localhost:3000/api/admin/revenue-summary?days=7
```

### See System Errors
```bash
curl -H "Authorization: Bearer YOUR_ID" \
  http://localhost:3000/api/admin/errors?severity=critical
```

### Review Pending Referrals
```bash
curl -H "Authorization: Bearer YOUR_ID" \
  http://localhost:3000/api/admin/referrals?status=pending
```

---

## 📈 Real-Time Features

✅ Auto-refreshes every 30 seconds  
✅ Live component status  
✅ Real-time error alerts  
✅ Live transaction tracking  
✅ User activity monitoring  

---

## 🚀 Next Steps

1. ✅ Run database schema
2. ✅ Add admin user
3. ✅ Import component
4. ✅ Add API routes
5. ✅ Test with keyboard shortcut
6. ✅ Check all 6 tabs
7. ✅ Deploy to production

---

## Troubleshooting

**Dashboard won't show?**
- Check admin user is in database: `SELECT * FROM admin_users;`
- Check adminId in localStorage

**No data showing?**
- Verify database connected
- Check API endpoints responding

**Errors in console?**
- Check token format in Authorization header
- Verify database URL is correct

---

**Need Help?** See `ADMIN_DASHBOARD_GUIDE.md` for detailed documentation.
