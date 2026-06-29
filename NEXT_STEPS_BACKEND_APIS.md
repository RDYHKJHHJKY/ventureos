# Feature #3: Backend API Endpoints - Getting Started

PostgreSQL migration is complete! ✅ Database is ready to go.

## What You Have Now

✅ PostgreSQL schema with 20+ tables  
✅ Connection pool (`lib/server/db.js`)  
✅ Auth utilities with bcrypt (`lib/server/auth.js`)  
✅ Database setup scripts (`scripts/db-setup.js`, `scripts/db-test.js`)  

## Quick Setup (5 minutes)

```bash
# 1. Install dependencies if not done yet
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# 3. Create database
node scripts/db-setup.js

# 4. Verify connection
node scripts/db-test.js

# Expected output: "🎉 All tests passed! Database is ready to use."
```

## Next: Implement Backend Auth Endpoints (Feature #3 Prep)

You now need to add API routes to `server.js`:

### 4 Endpoints to Add

1. **POST /api/auth/signup** - Create new user + workspace
2. **POST /api/auth/login** - Authenticate user
3. **POST /api/auth/logout** - Destroy session
4. **GET /api/auth/session** - Check current session

### Expected Effort: 4-6 hours

## Sample Implementation

Here's what to add to `server.js`:

```javascript
import express from 'express';
import { registerUser, loginUser, deleteSession, getSession } from './lib/server/auth.js';

const app = express();
app.use(express.json());

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, workspaceName } = req.body;
    
    if (!email || !password || !name || !workspaceName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await registerUser(email, password, name, workspaceName);
    
    // Set session cookie
    res.set('Set-Cookie', `ventureos_session=${result.sessionId}; HttpOnly; Path=/; Max-Age=${7*24*60*60}`);
    
    res.status(201).json({
      success: true,
      user: result.user,
      workspace: result.workspace,
      sessionId: result.sessionId,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const result = await loginUser(email, password);
    
    // Set session cookie
    res.set('Set-Cookie', `ventureos_session=${result.sessionId}; HttpOnly; Path=/; Max-Age=${7*24*60*60}`);
    
    res.json({
      success: true,
      user: result.user,
      workspace: result.workspace,
      sessionId: result.sessionId,
    });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', async (req, res) => {
  try {
    const sessionId = req.cookies?.ventureos_session;
    
    if (sessionId) {
      await deleteSession(sessionId);
    }
    
    res.set('Set-Cookie', 'ventureos_session=; HttpOnly; Path=/; Max-Age=0');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/session
app.get('/api/auth/session', async (req, res) => {
  try {
    const sessionId = req.cookies?.ventureos_session;
    
    if (!sessionId) {
      return res.json({ authenticated: false });
    }
    
    const session = await getSession(sessionId);
    
    if (!session) {
      return res.json({ authenticated: false });
    }
    
    res.json({
      authenticated: true,
      user: {
        id: session.user_id,
        email: session.email,
        name: session.name,
      },
      workspace: {
        id: session.workspace_id,
        name: session.workspace_name,
        plan: session.plan,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5173;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
```

## Testing the Endpoints

### Test Signup
```bash
curl -X POST http://localhost:5173/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe",
    "workspaceName": "My Company"
  }'
```

Expected response:
```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "workspace": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "My Company",
    "plan": "starter"
  },
  "sessionId": "..."
}
```

### Test Login
```bash
curl -X POST http://localhost:5173/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

### Test Session
```bash
curl http://localhost:5173/api/auth/session \
  -b "ventureos_session=YOUR_SESSION_ID"
```

## Documentation

📖 **Full API Spec**: [API_REFERENCE.md](API_REFERENCE.md)

📖 **Auth Implementation Details**: [IMPLEMENTATION_GUIDES.md](IMPLEMENTATION_GUIDES.md#feature-2-postgresql-migration) → Feature #3 Backend

📖 **PostgreSQL Setup**: [POSTGRES_SETUP.md](POSTGRES_SETUP.md)

## Resources Needed

- Express.js server already started? Check `server.js`
- Cookie parser middleware? `npm install cookie-parser`
- CORS if frontend on different port? `npm install cors`

## Success Criteria

- [ ] Signup creates user + workspace + session
- [ ] Login authenticates user + returns session
- [ ] Logout destroys session
- [ ] Session check returns user + workspace
- [ ] Frontend can communicate with backend
- [ ] Session persists across page reloads
- [ ] Passwords are hashed (not stored plain)
- [ ] Error handling for invalid inputs

## What's After This?

### Feature #3: GitHub API Integration (6-8 hours)
```javascript
// Real repo analysis
const analysis = await analyzeRepository('torvalds', 'linux');
// Returns: signals, scores, activity metrics
```

### Feature #4: NPM/PyPI Integration (5-7 hours)
```javascript
// Package registry data
const npmData = await getNpmPackageInfo('express');
// Returns: downloads, maintainers, versions
```

### Feature #5: CVE Database (6-8 hours)
```javascript
// Vulnerability data
const vulns = await checkNpmVulnerabilities('express', '4.17.1');
// Returns: CVE list with severity
```

## Quick Reference: Database

### Create user via SQL
```sql
-- Add to database directly
INSERT INTO users (email, password_hash, name)
VALUES ('test@test.com', '$2b$10$...', 'Test User')
RETURNING *;
```

### Check tables
```bash
psql $DATABASE_URL
# In psql:
\dt  # List tables
SELECT COUNT(*) FROM users;  # Check rows
```

### Cleanup (development)
```bash
psql $DATABASE_URL
# In psql:
DELETE FROM users;  # Clear all users
DELETE FROM workspaces;  # Clear all workspaces
```

## Estimated Timeline

| Task | Time |
|------|------|
| Implement signup endpoint | 1 hour |
| Implement login endpoint | 1 hour |
| Implement logout endpoint | 0.5 hours |
| Implement session endpoint | 0.5 hours |
| Add CORS/cookies/error handling | 1 hour |
| Test & debug | 1 hour |
| **Total** | **5 hours** |

## Next Steps

1. ✅ Database ready → verify with `node scripts/db-test.js`
2. ⏳ Add Express routes to `server.js`
3. ⏳ Test with curl commands above
4. ⏳ Connect frontend AuthPage to these endpoints
5. ⏳ Deploy to Azure

**Ready to start?** 🚀

Create the Express routes in `server.js` and test with the curl commands above. Then move to Feature #3 (GitHub integration).

Questions? See [POSTGRES_SETUP.md](POSTGRES_SETUP.md) or [API_REFERENCE.md](API_REFERENCE.md).
