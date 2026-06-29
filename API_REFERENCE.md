# VentureOS API Reference - Complete Implementation

Complete API contract for all 9 features. Use this to implement backend endpoints systematically.

---

## AUTHENTICATION APIs (Feature #1 Backend)

### POST /api/auth/login
**Request**:
```json
{
  "email": "user@example.com",
  "password": "hashed_password"
}
```

**Response (200)**:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "workspace": {
    "id": "uuid",
    "name": "My Workspace",
    "plan": "starter",
    "owner_id": "uuid"
  },
  "session_token": "session_id_here"
}
```

**Response (401)**:
```json
{
  "error": "Invalid email or password"
}
```

**Implementation Checklist**:
- [ ] Extract email/password from request body
- [ ] Query `users` table by email
- [ ] Use bcrypt to compare password hash
- [ ] Create session in `sessions` table
- [ ] Set httpOnly cookie `ventureos_session`
- [ ] Query default workspace for user
- [ ] Return user + workspace + session token

---

### POST /api/auth/signup
**Request**:
```json
{
  "email": "newuser@example.com",
  "password": "password",
  "name": "Jane Doe",
  "workspaceName": "My Company"
}
```

**Response (201)**:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "newuser@example.com",
    "name": "Jane Doe"
  },
  "workspace": {
    "id": "uuid",
    "name": "My Company",
    "plan": "starter",
    "owner_id": "uuid"
  },
  "session_token": "session_id_here"
}
```

**Implementation Checklist**:
- [ ] Validate email format
- [ ] Check email not already registered
- [ ] Hash password using bcrypt
- [ ] Create user in `users` table (transaction)
- [ ] Create workspace owned by user
- [ ] Add user as workspace member with role "owner"
- [ ] Create session
- [ ] Set httpOnly cookie
- [ ] Return new user + workspace

---

### POST /api/auth/logout
**Request**:
```json
{}
```

**Response (200)**:
```json
{
  "success": true
}
```

**Implementation Checklist**:
- [ ] Get session from cookie
- [ ] Delete from `sessions` table
- [ ] Clear httpOnly cookie
- [ ] Return success

---

### GET /api/auth/session
**Response (200 - Authenticated)**:
```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "workspace": {
    "id": "uuid",
    "name": "My Workspace",
    "plan": "starter"
  },
  "workspaces": [
    {
      "id": "uuid",
      "name": "My Workspace",
      "role": "owner"
    },
    {
      "id": "uuid",
      "name": "Team Workspace",
      "role": "member"
    }
  ]
}
```

**Response (401 - Not Authenticated)**:
```json
{
  "authenticated": false
}
```

**Implementation Checklist**:
- [ ] Get session from cookie
- [ ] Look up session in `sessions` table
- [ ] If missing, return `authenticated: false`
- [ ] Query user from `users` table
- [ ] Get current workspace (from header or first workspace)
- [ ] Get all workspaces where user is member (join `workspace_members`)
- [ ] Return all data

---

## ASSET MANAGEMENT APIs (Feature #2 Backend + Feature #3-5 Integration)

### GET /api/assets
**Query Parameters**:
```
workspace_id: uuid
page: 1 (optional, default 1)
limit: 20 (optional, default 20)
```

**Response (200)**:
```json
{
  "assets": [
    {
      "id": "uuid",
      "name": "torvalds/linux",
      "canonical_url": "https://github.com/torvalds/linux",
      "asset_type": "github_repo",
      "company": "Linux Kernel",
      "latest_trust_score": 85,
      "risk_level": "low",
      "last_scanned_at": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-15T09:00:00Z",
      "domains": ["github.com"],
      "tech_stack": ["c", "make"]
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20
}
```

**Implementation**:
```sql
SELECT * FROM assets 
WHERE workspace_id = $1 
ORDER BY updated_at DESC 
LIMIT $2 OFFSET $3;
```

---

### POST /api/assets
**Request**:
```json
{
  "workspace_id": "uuid",
  "name": "My Asset",
  "canonical_url": "https://github.com/owner/repo",
  "asset_type": "github_repo",
  "company": "My Company"
}
```

**Response (201)**:
```json
{
  "id": "uuid",
  "name": "My Asset",
  "canonical_url": "...",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

### GET /api/assets/{assetId}
**Response (200)**:
```json
{
  "id": "uuid",
  "name": "torvalds/linux",
  "canonical_url": "https://github.com/torvalds/linux",
  "latest_trust_score": 85,
  "scans": [
    {
      "id": "uuid",
      "status": "completed",
      "trust_score": 85,
      "verdict": "TRUSTED",
      "confidence": 92,
      "findings": [
        {
          "engine": "github_signals",
          "severity": "info",
          "title": "Active Development",
          "detail": "Recent commits detected"
        }
      ],
      "completed_at": "2024-01-15T10:35:00Z"
    }
  ]
}
```

---

## SCAN EXECUTION APIs (Features #3-5 + Feature #6)

### POST /api/scans
**Request**:
```json
{
  "workspace_id": "uuid",
  "asset_id": "uuid",
  "asset_url": "https://github.com/owner/repo",
  "scan_type": "full" (or "quick")
}
```

**Response (202 - Accepted)**:
```json
{
  "job_id": "scan-{assetId}-{timestamp}",
  "status": "queued",
  "scan_run_id": "uuid",
  "message": "Scan queued. Will complete in ~2 minutes."
}
```

**Implementation Checklist**:
- [ ] Create scan_run in DB with status="pending"
- [ ] Enqueue to Bull job queue
- [ ] Return immediately with job_id and scan_run_id
- [ ] Job processor runs async:
  - [ ] Call engineeringSignals() → GitHub
  - [ ] Call CVE checks → Snyk/NVD
  - [ ] Call registry checks → NPM/PyPI
  - [ ] Calculate trust_score and verdict
  - [ ] Insert findings into findings table
  - [ ] Update scan_run with results
  - [ ] Publish SCAN_COMPLETED event
  - [ ] Enqueue welcome email

---

### GET /api/scans/{scanRunId}
**Response (200)**:
```json
{
  "id": "uuid",
  "workspace_id": "uuid",
  "asset_id": "uuid",
  "status": "completed",
  "progress": 100,
  "trust_score": 85,
  "confidence": 92,
  "verdict": "TRUSTED",
  "explanation": "Asset shows strong engineering practices with regular updates and security policies.",
  "findings": [
    {
      "engine": "github_signals",
      "severity": "info",
      "title": "Active Development",
      "detail": "12 commits in last 30 days"
    },
    {
      "engine": "cve_snyk",
      "severity": "medium",
      "title": "Dependency Vulnerability",
      "detail": "lodash@4.17.15 has known vulnerability CVE-2021-23337"
    }
  ],
  "started_at": "2024-01-15T10:30:00Z",
  "completed_at": "2024-01-15T10:35:00Z"
}
```

---

### GET /api/scans/{scanRunId}/progress
**Response (200)**:
```json
{
  "status": "in_progress",
  "progress": 45,
  "current_stage": "analyzing_cve_database",
  "estimated_seconds_remaining": 30
}
```

---

## PASSPORT APIs (Feature #2 Backend)

### GET /api/passports
**Query Parameters**:
```
workspace_id: uuid
public: true/false (optional)
```

**Response (200)**:
```json
{
  "passports": [
    {
      "id": "uuid",
      "asset_id": "uuid",
      "asset_name": "torvalds/linux",
      "company": "Linux Foundation",
      "trust_score": 85,
      "verdict": "TRUSTED",
      "confidence": 92,
      "status": "active",
      "public": false,
      "badge_embed": "<iframe src='...'></iframe>",
      "issued_at": "2024-01-15T10:35:00Z",
      "revoked_at": null
    }
  ]
}
```

---

### POST /api/passports
**Request**:
```json
{
  "workspace_id": "uuid",
  "scan_run_id": "uuid",
  "asset_id": "uuid",
  "public": false
}
```

**Response (201)**:
```json
{
  "id": "uuid",
  "asset_name": "torvalds/linux",
  "trust_score": 85,
  "verdict": "TRUSTED",
  "public": false,
  "badge_embed": "<iframe>...</iframe>",
  "issued_at": "2024-01-15T10:35:00Z"
}
```

**Implementation**:
- [ ] Get scan_run and asset data
- [ ] Create passport in DB
- [ ] If public=true, generate shareable link
- [ ] Create badge HTML
- [ ] If email provided, queue email notification
- [ ] Return passport object

---

### GET /api/passports/{passportId}
**Response (200)**:
```json
{
  "id": "uuid",
  "asset_name": "torvalds/linux",
  "company": "Linux Foundation",
  "trust_score": 85,
  "verdict": "TRUSTED",
  "confidence": 92,
  "risk_items": [
    {
      "severity": "low",
      "category": "dependencies",
      "count": 2
    }
  ],
  "evidence": {
    "github_signals": {
      "active_development": true,
      "maintainer_count": 8,
      "recent_releases": 5
    },
    "security": {
      "has_security_policy": true,
      "vulnerability_count": 2
    }
  }
}
```

---

### GET /api/passports/{passportId}/pdf
**Response (200)**:
- Content-Type: application/pdf
- Binary PDF file

**Implementation**:
- [ ] Load passport data
- [ ] Generate HTML report
- [ ] Use puppeteer to render PDF
- [ ] Stream to client
- [ ] Cache generated PDFs

---

### DELETE /api/passports/{passportId}
**Response (200)**:
```json
{
  "success": true,
  "revoked_at": "2024-01-15T11:00:00Z"
}
```

---

## JOB QUEUE APIs (Feature #6)

### GET /api/jobs/{jobId}
**Response (200)**:
```json
{
  "id": "scan-{assetId}-{timestamp}",
  "status": "in_progress",
  "progress": 65,
  "started_at": "2024-01-15T10:30:00Z",
  "attempts": 1,
  "max_attempts": 3,
  "data": {
    "workspace_id": "uuid",
    "asset_id": "uuid"
  }
}
```

---

### GET /api/jobs/queue/{queueName}
**Response (200)**:
```json
{
  "queue": "scans",
  "counts": {
    "pending": 5,
    "in_progress": 2,
    "completed": 150,
    "failed": 3
  },
  "jobs": [
    {
      "id": "job-1",
      "status": "pending",
      "priority": 10
    }
  ]
}
```

---

## WEBHOOK APIs (Feature #8)

### POST /api/webhooks
**Request**:
```json
{
  "workspace_id": "uuid",
  "url": "https://your-service.com/webhook",
  "events": ["scan.completed", "passport.issued"],
  "active": true
}
```

**Response (201)**:
```json
{
  "id": "uuid",
  "workspace_id": "uuid",
  "url": "https://your-service.com/webhook",
  "events": ["scan.completed", "passport.issued"],
  "active": true,
  "secret": "webhook_signing_secret",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

### Webhook Delivery Format
**POST** to your webhook URL:
```json
{
  "event": "scan.completed",
  "timestamp": "2024-01-15T10:35:00Z",
  "data": {
    "scan_run_id": "uuid",
    "asset_id": "uuid",
    "trust_score": 85,
    "verdict": "TRUSTED"
  },
  "signature": "sha256_hmac_signature_here"
}
```

**Implementation**:
- [ ] Sign with HMAC-SHA256 using webhook secret
- [ ] POST with 10s timeout
- [ ] Retry up to 5 times with exponential backoff
- [ ] Store delivery status in DB
- [ ] Allow webhook disable after 5 consecutive failures

---

## MSP MANAGEMENT APIs (For multi-tenant features)

### GET /api/msp
**Query Parameters**:
```
msp_id: uuid
```

**Response (200)**:
```json
{
  "msp": {
    "id": "uuid",
    "name": "Managed Services Partner",
    "plan": "enterprise",
    "active": true,
    "workspaces": [
      {
        "id": "uuid",
        "name": "Client Workspace 1",
        "owner": "client@example.com"
      }
    ]
  }
}
```

---

### GET /api/msp/billing
**Query Parameters**:
```
msp_id: uuid
month: 2024-01
```

**Response (200)**:
```json
{
  "msp_id": "uuid",
  "month": "2024-01",
  "events": [
    {
      "event_type": "scan_run",
      "quantity": 42,
      "unit_price_cents": 50,
      "total_cents": 2100
    }
  ],
  "total_cents": 5250,
  "invoice_id": "INV-2024-01-001"
}
```

---

## MONITORING & HEALTH APIs

### GET /api/health
**Response (200)**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:35:00Z",
  "services": {
    "database": "ok",
    "redis": "ok",
    "github_api": "ok",
    "sendgrid": "ok"
  }
}
```

### GET /api/metrics
**Response (200)**:
```json
{
  "timestamp": "2024-01-15T10:35:00Z",
  "metrics": {
    "scans_today": 142,
    "avg_scan_duration_seconds": 45,
    "passports_issued": 89,
    "job_queue_size": 7,
    "error_rate_percent": 0.5
  }
}
```

---

## ERROR RESPONSES

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

**Common Error Codes**:
- `UNAUTHORIZED` (401) - Not authenticated or invalid token
- `FORBIDDEN` (403) - Authenticated but not allowed
- `NOT_FOUND` (404) - Resource doesn't exist
- `VALIDATION_ERROR` (400) - Invalid request format
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `INTERNAL_SERVER_ERROR` (500) - Server error

---

## IMPLEMENTATION PRIORITY

1. **Auth APIs** (login, signup, logout, session) - CRITICAL
2. **Asset Management** (CRUD) - CRITICAL
3. **Scan Execution** (POST /api/scans) - HIGH
4. **Scan Status** (GET /api/scans/{id}) - HIGH
5. **Passports** - MEDIUM
6. **Job Queue** - MEDIUM
7. **Webhooks** - LOW
8. **MSP Management** - LOW
9. **Monitoring** - LOW

---

## Testing Each Endpoint

```bash
# Auth
curl -X POST http://localhost:5173/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test","name":"Test","workspaceName":"Test WS"}'

# Check session
curl http://localhost:5173/api/auth/session -b "ventureos_session=..."

# Create asset
curl -X POST http://localhost:5173/api/assets \
  -H "Content-Type: application/json" \
  -H "x-workspace-id: {workspace_id}" \
  -d '{"name":"Test Asset","url":"https://github.com/test/repo"}'

# Start scan
curl -X POST http://localhost:5173/api/scans \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"...","asset_id":"...","asset_url":"..."}'

# Check scan progress
curl http://localhost:5173/api/scans/{scan_id}
```

---

Done! Follow these APIs in order of priority to build out the production backend.
