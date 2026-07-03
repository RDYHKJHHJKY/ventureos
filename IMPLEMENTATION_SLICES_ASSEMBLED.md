# VentureOS Implementation Slices - Complete Assembly

**Last Updated**: 2026-07-02  
**Status**: Active Implementation Phase  
**Scope**: Complete feature stack from authentication through SPR trust engine

---

## 📋 Executive Summary

This document consolidates all implementation guidance, execution plans, and current status for VentureOS. Use this as your **single source of truth** for:

- What has been completed
- What is in progress
- What's next and in what order
- How each feature depends on others
- Step-by-step execution guides for each phase

**Current Phase**: Core Platform Stabilization + Feature Completion
**Target**: Production-ready trust engine with real evidence scoring

---

## 🚀 Feature Completion Overview

| Feature | Status | Effort | Priority | Depends On |
|---------|--------|--------|----------|-----------|
| #1: Auth UI | ✅ Complete | - | CRITICAL | None |
| #2: PostgreSQL Migration | ✅ Complete | 12h | CRITICAL | None |
| #3: Backend Auth APIs | 🚧 In Progress | 4-6h | HIGH | #2 |
| #4: GitHub Integration | ⏳ Not Started | 8-10h | HIGH | #2, #3 |
| #5: Package Registry APIs | ⏳ Not Started | 6-8h | HIGH | #2, #3 |
| #6: CVE Integration | ⏳ Not Started | 6-8h | HIGH | #2, #3 |
| #7: Background Jobs | ⏳ Not Started | 4-6h | HIGH | #2, #3, #4-6 |
| #8: Email Delivery | ⏳ Not Started | 3-4h | MEDIUM | #7 |
| #9: Webhook Events | ⏳ Not Started | 4-5h | MEDIUM | #2, #3, #7 |
| #10: PDF Reports | ⏳ Not Started | 3-4h | MEDIUM | #2 |
| #11: SPR Trust Engine | ⏳ Not Started | 12-16h | CRITICAL | #2, #3, #4-6 |

---

## 🎯 Phase 1: Core Stabilization (IN PROGRESS)

### Objective
Remove demo behavior, harden SPR workspace scoping, and ensure production endpoints are deterministic.

### Phase 1 Tasks

#### Task 1.1: Remove Demo/Fallback Behavior
**Status**: 🚧 In Progress
**Files**:
- `lib/server/api-router.js` - Remove synthetic default logic
- `lib/server/auth.js` - Remove demo session fallbacks
- `server.js` - Ensure production endpoints don't rely on placeholder IDs

**Specific Changes**:
```javascript
// REMOVE: Demo workspace fallback
// ctx.workspaceId = ctx.workspaceId || 'demo-workspace-123';

// ENFORCE: Explicit workspace requirement
if (!ctx.workspaceId) {
  return res.status(400).json({ 
    error: 'Missing or invalid workspace context',
    code: 'WORKSPACE_REQUIRED' 
  });
}
```

#### Task 1.2: Harden SPR Workspace Scoping
**Status**: 🚧 Planned
**Files**:
- `lib/server/api-router.js` - SPR routes
- `lib/server/spr/passport.js` - Passport issuance
- `lib/server/restricted-tokens.js` - Token validation

**Changes**:
1. Require explicit `workspaceId` in all SPR payloads
2. Remove hidden `ctx.workspaceId` fallbacks
3. Enforce workspace matching between tokens and requests
4. Add 400/403 errors with audit logging

#### Task 1.3: Deterministic Validation & Error Handling
**Status**: 🚧 Planned
**Implementation**:
- Standardize error responses (400: missing/malformed, 403: forbidden)
- Add request ID and timestamp to all error logs
- Implement workspace violation audit trail
- Test that every SPR endpoint rejects ambiguous requests

#### Task 1.4: Freeze New Module Addition
**Status**: 🚧 Active
**Rule**: No new SPR/trust modules until Phase 1 is complete.
**Focus**: Stabilizing existing modules only.

---

## ✅ Phase 0: Foundation & Setup (COMPLETE)

### What's Already Done

#### 0.1 Repository Structure
- ✅ Modular backend (`lib/server/`)
- ✅ React frontend (`src/`)
- ✅ PostgreSQL database schema (`db/schema.sql`)
- ✅ Express API router (`lib/server/api-router.js`)
- ✅ Authentication utilities (`lib/server/auth.js`)
- ✅ Session management (`lib/server/billing.js`)

#### 0.2 Authentication & Authorization
- ✅ User registration with bcrypt hashing
- ✅ Session-based authentication
- ✅ Workspace membership and role tracking
- ✅ Tenant-aware access control

#### 0.3 Database
- ✅ 23-table PostgreSQL schema ready
- ✅ Connection pool configured
- ✅ Database setup scripts functional

#### 0.4 Frontend Auth UI
- ✅ Login/signup forms with validation
- ✅ Workspace switching UI
- ✅ Session state management
- ✅ Integration into main VentureOS component

---

## 🔄 Phase 2: Workspace Intelligence (PLANNED)

### Objective
Build real-time workspace overview, trust dashboards, and health aggregation.

### Phase 2 Tasks

#### Task 2.1: Workspace Overview Endpoint
**File**: `lib/server/api-router.js`
**Endpoint**: `GET /api/workspaces/:id/overview`
**Returns**:
- Workspace metadata (name, owner, members, plan)
- Asset count and status summary
- Latest trust scores (by asset category)
- Risk timeline (last 30 days)
- Top findings and alerts

#### Task 2.2: Dashboard Aggregation
**File**: `lib/server/billing.js` (risk logic), React UI
**Data Aggregated**:
- Trust score distribution
- Asset health breakdown
- Finding severity breakdown
- Scan completion rates

#### Task 2.3: Executive Summary Generation
**File**: `lib/server/billing.js`
**Output**:
- Key metrics (total assets, avg trust score, critical findings)
- Trend analysis (improving, stable, declining)
- Top recommendations

#### Task 2.4: Alert & Timeline Generation
**File**: `lib/server/scoring.js`
**Implementation**:
- Risk spike detection
- Aging finding alerts
- Compliance deadline warnings

---

## 🔐 Phase 3: Trust Graph (PLANNED)

### Objective
Build deterministic graph of software dependencies, ownership, and evidence relationships.

### Phase 3 Tasks

#### Task 3.1: Node & Edge Construction
**File**: `lib/server/trust-graph.js`
**Node Types**:
- Software entities (packages, repos, domains, certs)
- Organizations and individuals
- Artifacts (builds, binaries, containers)

**Edge Types**:
- Dependencies (package → package, repo → package)
- Ownership (organization → software)
- Provenance (source → artifact)

#### Task 3.2: Traversal & Queries
**File**: `lib/server/trust-graph.js`
**Operations**:
- `findUpstream(asset)` - dependencies and their sources
- `findDownstream(asset)` - dependent assets
- `findOwner(asset)` - who creates/maintains
- `findEvidence(asset)` - all scoring evidence

#### Task 3.3: Graph Visualization
**File**: React UI component
**Features**:
- Interactive node layout
- Risk coloring (green → red)
- Evidence tooltips
- Filter by asset type

---

## 📊 Phase 4: Coverage Engine (PLANNED)

### Objective
Score coverage gaps and generate recommendations.

### Phase 4 Tasks

#### Task 4.1: Coverage Scoring
**File**: `lib/server/coverage.js`
**Baselines by Asset Type**:
- Repositories: SBOM, scan results, code review evidence
- Packages: Security advisories, provenance, maintenance signals
- Domains/Certificates: WHOIS, SSL/TLS validation, DNS records
- CI/CD: Build logs, artifact signatures, provenance proofs

#### Task 4.2: Gap Reporting
**Output**: For each asset and category:
- Coverage % (evidence present / expected)
- Missing evidence (what's needed next)
- Confidence penalty (how it affects trust score)

#### Task 4.3: Recommendations Generation
**Logic**:
- High-gap assets → "Run security scan"
- Missing SBOM → "Generate SBOM"
- Old provenance → "Re-attest"

#### Task 4.4: Trend Reporting
**Metrics**:
- Coverage improvement over time
- Stale evidence aging

---

## ⚠️ Phase 5: Risk Intelligence (PLANNED)

### Objective
Real-time risk scoring, severity bands, and alerting.

### Phase 5 Tasks

#### Task 5.1: Risk Scoring & Severity Bands
**File**: `lib/server/scoring.js`
**Scoring Model**:
- Trust score (0-100): evidence quality + freshness
- Risk band: Critical (0-30), High (30-60), Medium (60-75), Low (75-100)
- Aging penalty: Evidence older than 90 days loses confidence

#### Task 5.2: Staleness & Aging Analysis
**Logic**:
- Track evidence collection date
- Reduce confidence if stale (>90 days old)
- Alert on critical assets with aging evidence

#### Task 5.3: Risk Timeline Generation
**Output**: Time-series data showing:
- Trust score changes
- New findings
- Evidence freshness

#### Task 5.4: Alerting System
**Rules**:
- Risk spike detected (score drops >20 points)
- Critical finding appears
- Evidence about to expire
- SLA breach (asset overdue for scan)

---

## 📄 Phase 6: Reporting (PLANNED)

### Objective
Export evidence and scoring for stakeholders.

### Phase 6 Tasks

#### Task 6.1: Report Generation Endpoints
**Files**:
- `lib/server/api-router.js` - Routes
- `lib/server/billing.js` - Logic

**Endpoints**:
- `GET /api/workspaces/:id/report?format=json|csv|pdf`
- `GET /api/assets/:id/report`
- `GET /api/scan-runs/:id/report`

#### Task 6.2: Export Formats
- **JSON**: Full structured export (for integrations)
- **CSV**: Tabular data (findings, assets, scores)
- **PDF**: Executive summary + charts (requires Phase #10)

#### Task 6.3: Report Templates
- **Executive**: Key metrics, trends, top risks, recommendations
- **Technical**: Detailed findings, evidence lists, scoring breakdown

---

## 🎓 Phase 7: Onboarding (PLANNED)

### Objective
Guide new workspace users through setup.

### Phase 7 Tasks

#### Task 7.1: Onboarding State
**File**: `lib/server/onboarding.js`
**Stages**:
1. Workspace created (select industry, company size)
2. Assets imported (upload CSV or connect APIs)
3. First scan launched
4. Evidence collected
5. Passport ready
6. Team invited

#### Task 7.2: Setup Wizard
**UI**: Modal flow with steps, progress bar
**Outputs**: Guided imports, API key setup, first scan

#### Task 7.3: Import Wizard Flow
**Input**: CSV with assets, GitHub repos, npm packages
**Validation**: Format, duplicates, missing fields
**Output**: Batch import with feedback

---

## 📥 Phase 8: Import Engine (PLANNED)

### Objective
Bulk import assets from CSV/JSON with deduplication.

### Phase 8 Tasks

#### Task 8.1: CSV/JSON Import Handling
**File**: `lib/server/api-router.js`
**Endpoint**: `POST /api/workspaces/:id/import`
**Input Schema**:
```csv
Name,Type,URL,Company,Domains,Tech Stack
my-app,repo,https://github.com/...,MyCompany,"app.com,api.app.com","Node.js,React,PostgreSQL"
```

#### Task 8.2: Artifact Normalization
**Logic**:
- Parse URLs → canonical forms
- Detect asset type from URL pattern
- Normalize tech stack tags

#### Task 8.3: Deduplication
**Rules**:
- Same URL → merge into existing asset
- Same package name across registries → link
- Same domain with different casing → dedupe

#### Task 8.4: Malformed Reporting
**Output**: Line-by-line feedback:
- Missing required field
- Invalid URL format
- Duplicate detection

---

## 🔒 Phase 9: SPR Trust Engine (IN PROGRESS)

### Objective
Real evidence-driven trust scoring with passports and procurement filtering.

### Phase 9 Key Files
- `lib/server/api-router.js` - SPR routes
- `lib/server/spr/passport.js` - Passport issuance
- `lib/server/scoring.js` - Evidence scoring
- `test/spr-mvp.js` - Regression tests

### Phase 9 Tasks

#### Task 9.1: Evidence Registry
**File**: `lib/server/api-router.js`
**Endpoints**:
- `POST /api/spr/evidence/create` - Submit evidence
- `GET /api/spr/evidence/:id` - Retrieve evidence
- `GET /api/spr/evidence/search` - Find evidence

**Evidence Types**:
- SBOM (Software Bill of Materials)
- CVE records (vulnerability data)
- Domain verification (WHOIS, DNS, SSL)
- Repository metadata (GitHub stars, last commit, contributors)
- Package metadata (downloads, maintainers, last version)
- Build artifacts (signatures, provenance, container metadata)
- Certifications (SOC2, ISO, SLSA, Sigstore)

#### Task 9.2: Evidence Normalization & Freshness
**Normalization**:
- SBOM: Parse SPDX/CycloneDX → canonical format
- CVE: NVD format → internal schema
- Domains: Extract registrar, expiry, DNS records

**Freshness Tracking**:
- Collection timestamp
- Source authority (NVD, GitHub, direct)
- Confidence score based on freshness (0-100)

#### Task 9.3: Monitoring Signals
**File**: `lib/server/scoring.js`
**Signals**:
- SBOM completeness (% of dependencies covered)
- CVE currency (vulnerabilities within N days)
- Domain health (registrar status, SSL validity)
- Repository signals (commit frequency, contributor diversity)
- Package signals (release frequency, maintenance level)
- Build signals (artifact signature verification)

#### Task 9.4: Passport Issuance, Renewal, Versioning & Revocation
**File**: `lib/server/spr/passport.js`
**Passport Data**:
```json
{
  "id": "uuid",
  "asset_name": "my-package",
  "version": "1.2.3",
  "workspace_id": "uuid",
  "trust_score": 85,
  "confidence": 0.92,
  "issued_at": "2026-07-02T...",
  "expires_at": "2026-10-02T...",
  "evidence_summary": {
    "sbom_present": true,
    "cve_current": true,
    "cert_valid": true,
    "repo_active": true
  },
  "verdict": "TRUSTED",
  "justification": "..."
}
```

**Operations**:
- **Issuance**: Create initial passport after evidence collection
- **Renewal**: Recompute on next evidence update
- **Versioning**: Track passport history (v1, v2, etc.)
- **Revocation**: Mark invalid if critical evidence revoked

#### Task 9.5: Procurement Filtering & Trust Evaluation
**File**: `lib/server/api-router.js`
**Endpoint**: `POST /api/spr/procure/filter`
**Input**: List of candidate assets
**Output**: Ranked by trust score with procurement recommendation
**Logic**:
- Fetch latest passports
- Filter by trust band (must_trusted, may_review, reject)
- Rank by score and freshness

---

## 🔐 Phase 10: Privacy Layer (PLANNED)

### Objective
Evidence visibility, access control, and audit trails.

### Phase 10 Tasks

#### Task 10.1: Evidence Visibility Levels
**Levels**:
- **PUBLIC**: Published by vendor (certs, repo stats)
- **WORKSPACE**: Shared with workspace only
- **RESTRICTED**: Only buyer (invoice, proprietary evidence)
- **CONFIDENTIAL**: Vendor-only (internal scores)

#### Task 10.2: Buyer-Token Access Control
**Implementation**:
- Scoped tokens with workspace + visibility filter
- Buyer sees only WORKSPACE + PUBLIC evidence
- Enforce at query level

#### Task 10.3: Evidence Bundle Metadata
**Bundle**:
- Selected evidence set for buyer
- Includes only authorized visibility levels
- Signed and timestamped

#### Task 10.4: Restricted Passport Views
**Logic**:
- Buyer passport shows evidence summary (not internals)
- Trust score visible, justification may be redacted
- Audit trail separate from evidence content

#### Task 10.5: Audit Trail Coverage
**Tracked Events**:
- Evidence access (who, when, visibility level)
- Passport issuance and changes
- Token creation and scoping

---

## ✔️ Phase 11: Verification Layer (PLANNED)

### Objective
Standards ingestion and compliance normalization.

### Phase 11 Tasks

#### Task 11.1: Standards Ingestion
**File**: `lib/server/api-router.js`
**Standards**:
- **SLSA**: Framework levels 0-3 for artifact provenance
- **Sigstore**: Keyless signing verification
- **SOC2**: Type I/II compliance reports
- **ISO 27001**: Information security management

**Implementation**:
- POST endpoint to ingest standard attestations
- Normalize to canonical evidence format
- Store with source authority and timestamp

#### Task 11.2: Provenance & Compliance Normalization
**Normalization**:
- SLSA levels → confidence modifier
- Sigstore signatures → verification timestamp
- SOC2 reports → compliance evidence
- ISO certs → standards compliance evidence

#### Task 11.3: Evidence Storage & Retrieval
**Storage**: Normalize all to single evidence schema
**Retrieval**: Filter by standard type

---

## 🧪 Phase 12: Testing & QA (PLANNED)

### Objective
Comprehensive test coverage for all features.

### Phase 12 Test Suites

#### Unit Tests
**Files**:
- `test/auth.test.js` - Auth flows
- `test/scoring.test.js` - Trust scoring logic
- `test/graph.test.js` - Graph operations

#### Integration Tests
**Files**:
- `test/api.test.js` - Endpoint behavior
- `test/spr-mvp.js` - SPR workflows (already started)

#### End-to-End Tests
**Files**:
- `test/e2e.test.js` - Full user journeys
- Example: Import → Scan → Get Passport

---

## 📦 Phase 13: Deployment & Operations (PLANNED)

### Objective
Production-ready infrastructure and observability.

### Phase 13 Tasks

#### Task 13.1: Container Deployment
**Files**:
- `Dockerfile` - Application image
- `docker-compose.yml` - Local dev stack
- `.github/workflows/deploy.yml` - CI/CD pipeline

#### Task 13.2: Environment Configuration
**Files**:
- `.env.example` - Template
- `lib/server/config.js` - Configuration loading

**Variables**:
- Database URL
- API keys (GitHub, npm, NVD, SendGrid)
- Secrets (session key, JWT key)

#### Task 13.3: Logging & Monitoring
**Implementation**:
- Structured logging (Winston/Pino)
- Error tracking (Sentry)
- Metrics (Prometheus)
- Distributed tracing (OpenTelemetry)

#### Task 13.4: Backup & Recovery
**Strategy**:
- Daily database backups
- Point-in-time recovery
- Disaster recovery runbook

---

## 🎯 Recommended Execution Order (By Dependency)

### Week 1: Core APIs (Features #3-5)
```
Day 1-2: Complete Feature #3 (Backend Auth APIs)
Day 3-4: Feature #4 (GitHub Integration)
Day 5: Feature #5 (Package Registries) + Feature #6 (CVE)
Day 6-7: Feature #7 (Background Jobs)
```

### Week 2: Evidence & Scoring (Features #9-11)
```
Day 1-2: Feature #9 Part 1 (Evidence Registry + Normalization)
Day 3-4: Feature #9 Part 2 (Passport Issuance)
Day 5-6: Feature #11 (Standards & Compliance)
Day 7: Feature #10 (Privacy Layer)
```

### Week 3: UI & Reporting (Features #8, #10, #12)
```
Day 1-2: Feature #8 (Webhook Events)
Day 3-4: Feature #12 (PDF Reports)
Day 5-6: Integration testing
Day 7: Deployment prep
```

---

## 🛠️ Development Environment Setup

### Prerequisites
```bash
# Node.js 18+ and npm
node --version
npm --version

# PostgreSQL 14+
psql --version

# (Optional) Docker for local PostgreSQL
docker --version
```

### Initial Setup
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL connection string
# Example: DATABASE_URL=postgresql://user:pass@localhost:5432/ventureos

# 3. Create database and tables
node scripts/db-setup.js

# 4. Run tests to verify setup
npm test

# 5. Start development server
npm run dev
```

### Database Connection
```javascript
// .env
DATABASE_URL=postgresql://postgres:password@localhost:5432/ventureos
NODE_ENV=development
GITHUB_TOKEN=your_github_token
NPM_TOKEN=your_npm_token
```

---

## 📚 Related Documentation

| Document | Purpose |
|----------|---------|
| [IMPLEMENTATION_EXECUTION_PLAN.md](./IMPLEMENTATION_EXECUTION_PLAN.md) | High-level strategy and phases |
| [IMPLEMENTATION_EXECUTION_CHECKLIST.md](./IMPLEMENTATION_EXECUTION_CHECKLIST.md) | Detailed task checklist by phase |
| [IMPLEMENTATION_GUIDES.md](./IMPLEMENTATION_GUIDES.md) | Code samples and step-by-step guides |
| [STATUS_DASHBOARD.md](./STATUS_DASHBOARD.md) | Current completion status |
| [NEXT_STEPS_BACKEND_APIS.md](./NEXT_STEPS_BACKEND_APIS.md) | Immediate next tasks |
| [APP_SPECS.md](./APP_SPECS.md) | Full specification |
| [ARCHITECTURE/](./ARCHITECTURE/) | Architecture decision records |

---

## 🚦 Success Criteria

### By End of Phase 2 (Workspace Intelligence)
- [ ] All workspace-level data queries return correct, production-quality results
- [ ] Dashboard shows real asset and evidence data
- [ ] Risk and trust scores are based on actual evidence, not synthetic data

### By End of Phase 9 (SPR Trust Engine)
- [ ] Evidence ingestion is deterministic and auditable
- [ ] Passports are issued with real scores based on evidence
- [ ] Procurement filtering works with actual workspace data
- [ ] All demo/synthetic code is removed

### By Release (All Phases)
- [ ] Zero demo behavior in production flows
- [ ] 80%+ code test coverage
- [ ] All endpoints have deterministic validation
- [ ] Audit trail covers all trust operations
- [ ] Documentation matches implementation

---

## 📞 Contact & Questions

- For phase-specific questions, check the relevant implementation guide
- For dependencies between features, reference the feature matrix above
- For current blockers, check the Status Dashboard

**Next Action**: Start Phase 1 stabilization or jump to Feature #3 (Backend Auth APIs) if Phase 1 is clear.

---

**Generated**: 2026-07-02  
**Assembly Version**: 1.0  
**Status**: Ready for Implementation
