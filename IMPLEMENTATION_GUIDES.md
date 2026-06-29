# VentureOS Production Features - Implementation Guides

## Overview
Complete step-by-step implementation guides for 7 critical production features. Auth UI (Feature #1) is complete. Follow these guides sequentially or in parallel based on team capacity.

---

## Feature #2: PostgreSQL Migration

**Time Estimate**: 8-12 hours  
**Dependencies**: None  
**Priority**: HIGH (blocks Features 3-7)

### Architecture
Replace current JSON file-based data store with PostgreSQL for persistent, queryable data.

### Step 1: Database Schema

Create `db/schema.sql`:

```sql
-- Users & Authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(50) DEFAULT 'starter',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(50) DEFAULT 'member',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- Assets & Analysis
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name VARCHAR(255) NOT NULL,
  canonical_url VARCHAR(500),
  asset_type VARCHAR(50),
  company VARCHAR(255),
  domains TEXT[],
  tech_stack TEXT[],
  founded_year INT,
  latest_trust_score INT,
  risk_level VARCHAR(50),
  last_scanned_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  asset_id UUID NOT NULL REFERENCES assets(id),
  status VARCHAR(50) DEFAULT 'pending',
  trust_score INT,
  confidence INT,
  verdict VARCHAR(100),
  explanation TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id UUID NOT NULL REFERENCES scan_runs(id),
  engine VARCHAR(50),
  severity VARCHAR(50),
  title VARCHAR(255),
  detail TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE passports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  scan_run_id UUID NOT NULL REFERENCES scan_runs(id),
  asset_id UUID NOT NULL REFERENCES assets(id),
  asset_name VARCHAR(255),
  company VARCHAR(255),
  trust_score INT,
  verdict VARCHAR(100),
  confidence INT,
  status VARCHAR(50) DEFAULT 'active',
  public BOOLEAN DEFAULT false,
  badge_embed TEXT,
  evidence_summary TEXT,
  issued_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name VARCHAR(255) NOT NULL,
  vendor VARCHAR(255),
  sector VARCHAR(255),
  repo_url VARCHAR(500),
  latest_score INT,
  confidence INT,
  risk_band VARCHAR(50),
  narrative TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  artifact_type VARCHAR(50),
  content TEXT,
  original_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  signal_name VARCHAR(100),
  signal_value FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- MSP Management
CREATE TABLE msps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(50) DEFAULT 'starter',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE msp_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msp_id UUID NOT NULL REFERENCES msps(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(50) DEFAULT 'member',
  UNIQUE(msp_id, user_id)
);

CREATE TABLE msp_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msp_id UUID NOT NULL REFERENCES msps(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  UNIQUE(msp_id, workspace_id)
);

CREATE TABLE billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msp_id UUID NOT NULL REFERENCES msps(id),
  event_type VARCHAR(50),
  quantity INT,
  amount_cents INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_assets_workspace ON assets(workspace_id);
CREATE INDEX idx_scan_runs_asset ON scan_runs(asset_id);
CREATE INDEX idx_passports_workspace ON passports(workspace_id);
CREATE INDEX idx_projects_workspace ON projects(workspace_id);
CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
```

### Step 2: Install Dependencies

```bash
npm install pg dotenv
npm install -D @types/pg
```

### Step 3: Create Connection Pool

Create `lib/server/db.js`:

```javascript
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default pool;
```

### Step 4: Replace Data Store

Update `lib/server/data-store.js` to use PostgreSQL instead of JSON:

```javascript
import { query, transaction } from './db.js';

export async function getAssets(workspaceId) {
  const result = await query(
    'SELECT * FROM assets WHERE workspace_id = $1 ORDER BY updated_at DESC',
    [workspaceId]
  );
  return result.rows;
}

export async function createAsset(workspaceId, assetData) {
  const result = await query(
    `INSERT INTO assets (workspace_id, name, canonical_url, asset_type, company, domains, tech_stack)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [workspaceId, assetData.name, assetData.url, assetData.type, assetData.company, assetData.domains, assetData.tech]
  );
  return result.rows[0];
}

export async function createScanRun(workspaceId, assetId, scanData) {
  return transaction(async (client) => {
    const scanResult = await client.query(
      `INSERT INTO scan_runs (workspace_id, asset_id, status, trust_score, confidence, verdict, explanation)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [workspaceId, assetId, 'completed', scanData.trust, scanData.confidence, scanData.verdict, scanData.explanation]
    );
    
    const scanRunId = scanResult.rows[0].id;
    
    // Insert findings
    for (const finding of (scanData.findings || [])) {
      await client.query(
        `INSERT INTO findings (scan_run_id, engine, severity, title, detail)
         VALUES ($1, $2, $3, $4, $5)`,
        [scanRunId, finding.engine, finding.severity, finding.title, finding.detail]
      );
    }
    
    // Update asset
    await client.query(
      'UPDATE assets SET latest_trust_score = $1, updated_at = NOW() WHERE id = $2',
      [scanData.trust, assetId]
    );
    
    return scanResult.rows[0];
  });
}

export async function getPassports(workspaceId) {
  const result = await query(
    'SELECT * FROM passports WHERE workspace_id = $1 AND status = $2 ORDER BY issued_at DESC',
    [workspaceId, 'active']
  );
  return result.rows;
}

export async function createPassport(workspaceId, scanRunId, assetId) {
  const scanResult = await query(
    'SELECT * FROM scan_runs WHERE id = $1',
    [scanRunId]
  );
  const scan = scanResult.rows[0];
  
  const assetResult = await query(
    'SELECT * FROM assets WHERE id = $1',
    [assetId]
  );
  const asset = assetResult.rows[0];
  
  const result = await query(
    `INSERT INTO passports (workspace_id, scan_run_id, asset_id, asset_name, company, trust_score, verdict, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [workspaceId, scanRunId, assetId, asset.name, asset.company, scan.trust_score, scan.verdict, scan.confidence]
  );
  return result.rows[0];
}
```

### Step 5: Environment Variables

Add to `.env`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/ventureos
```

### Step 6: Deployment Setup

For Azure Database for PostgreSQL:

```bash
# Create instance via Azure CLI
az postgres server create \
  --resource-group ventureos \
  --name ventureos-db \
  --location eastus \
  --admin-user dbadmin \
  --generate-ssh-public-key
```

---

## Feature #3: GitHub API Integration

**Time Estimate**: 6-8 hours  
**Dependencies**: Feature #2 (PostgreSQL)  
**Priority**: HIGH (core data source)

### Architecture
Real-time analysis of GitHub repositories for contributors, releases, activity signals.

### Step 1: Create GitHub Service

Create `lib/server/github.js`:

```javascript
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function githubRequest(path, options = {}) {
  const url = `${GITHUB_API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      ...options.headers,
    },
    ...options,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GitHub API error: ${error.message}`);
  }
  
  return response.json();
}

export async function analyzeRepository(owner, repo) {
  try {
    // Get basic repo info
    const repoData = await githubRequest(`/repos/${owner}/${repo}`);
    
    // Get recent commits
    const commits = await githubRequest(`/repos/${owner}/${repo}/commits?per_page=100`);
    
    // Get releases
    const releases = await githubRequest(`/repos/${owner}/${repo}/releases?per_page=50`);
    
    // Get contributors
    const contributors = await githubRequest(`/repos/${owner}/${repo}/contributors?per_page=100`);
    
    // Calculate signals
    const signals = {
      maintainers: contributors.slice(0, 5).length,
      recentActivityScore: calculateActivityScore(commits),
      releaseFrequencyScore: calculateReleaseFrequency(releases),
      contributorGrowth: contributors.length,
      lastActivityDays: getDaysSinceLastCommit(commits[0]?.commit.committer.date),
      licensePresent: !!repoData.license,
      readmePresent: !!repoData.description,
      issuesOpen: repoData.open_issues_count,
      starCount: repoData.stargazers_count,
    };
    
    return {
      url: repoData.html_url,
      name: repoData.full_name,
      description: repoData.description,
      language: repoData.language,
      signals,
      company: extractCompanyFromRepo(repoData),
      lastUpdate: repoData.updated_at,
    };
  } catch (error) {
    console.error('GitHub analysis error:', error);
    throw error;
  }
}

function calculateActivityScore(commits) {
  if (!commits || commits.length === 0) return 0;
  
  // Score based on recent commit frequency
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentCommits = commits.filter(c => 
    new Date(c.commit.committer.date) > thirtyDaysAgo
  ).length;
  
  return Math.min(100, (recentCommits / 10) * 100);
}

function calculateReleaseFrequency(releases) {
  if (!releases || releases.length === 0) return 0;
  
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const recentReleases = releases.filter(r =>
    new Date(r.published_at) > sixMonthsAgo
  ).length;
  
  return Math.min(100, (recentReleases / 8) * 100);
}

function getDaysSinceLastCommit(lastDate) {
  if (!lastDate) return 365;
  const days = Math.floor((Date.now() - new Date(lastDate)) / (1000 * 60 * 60 * 24));
  return Math.min(365, days);
}

function extractCompanyFromRepo(repoData) {
  return repoData.owner?.company || repoData.organization?.login || 'Unknown';
}

export async function getRepositorySecurityInfo(owner, repo) {
  try {
    // Get security insights if available
    const advisories = await githubRequest(`/repos/${owner}/${repo}/dependabot/alerts`);
    return {
      vulnerabilityCount: advisories.length,
      hasSecurityPolicy: await checkSecurityPolicy(owner, repo),
    };
  } catch (error) {
    return { vulnerabilityCount: 0, hasSecurityPolicy: false };
  }
}

async function checkSecurityPolicy(owner, repo) {
  try {
    await githubRequest(`/repos/${owner}/${repo}/contents/SECURITY.md`);
    return true;
  } catch {
    return false;
  }
}
```

### Step 2: Integrate into Analysis Engine

Update `lib/server/scoring.js`:

```javascript
import { analyzeRepository, getRepositorySecurityInfo } from './github.js';

export async function engineeringSignals(assetUrl) {
  const match = assetUrl.match(/github\.com\/(.+?)\/(.+?)(?:\/|$)/);
  if (!match) return { score: 0 };
  
  const [, owner, repo] = match;
  
  try {
    const repoAnalysis = await analyzeRepository(owner, repo);
    const securityInfo = await getRepositorySecurityInfo(owner, repo);
    
    const engineeringScore = Math.round(
      repoAnalysis.signals.recentActivityScore * 0.3 +
      repoAnalysis.signals.releaseFrequencyScore * 0.3 +
      (repoAnalysis.signals.maintainers > 0 ? 80 : 40) * 0.2 +
      (repoAnalysis.signals.licensePresent ? 100 : 50) * 0.2
    );
    
    return {
      score: engineeringScore,
      signals: repoAnalysis.signals,
      hasSecurityPolicy: securityInfo.hasSecurityPolicy,
    };
  } catch (error) {
    console.error('Engineering signals error:', error);
    return { score: 0, error: error.message };
  }
}
```

### Step 3: Environment Setup

```bash
# Create GitHub token at https://github.com/settings/tokens
# Scopes: repo, read:security_events
# Add to .env:
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxx
```

---

## Feature #4: NPM & PyPI Integration

**Time Estimate**: 5-7 hours  
**Dependencies**: Feature #2 (PostgreSQL)  
**Priority**: MEDIUM

### Architecture
Fetch package metadata, dependencies, and vulnerability data from NPM and PyPI registries.

### Step 1: Create Package Registry Service

Create `lib/server/registries.js`:

```javascript
const NPM_API = 'https://registry.npmjs.org';
const PYPI_API = 'https://pypi.org/pypi';

export async function getNpmPackageInfo(packageName) {
  try {
    const response = await fetch(`${NPM_API}/${packageName}`);
    if (!response.ok) throw new Error('Package not found');
    
    const data = await response.json();
    const latest = data['dist-tags'].latest;
    
    return {
      name: data.name,
      version: latest,
      description: data.description,
      homepage: data.homepage,
      repository: data.repository?.url,
      downloads: await getNpmDownloads(packageName),
      maintainers: data.maintainers?.length || 0,
      created: new Date(data.time.created),
      modified: new Date(data.time[latest]),
      license: data.license,
    };
  } catch (error) {
    console.error('NPM API error:', error);
    throw error;
  }
}

async function getNpmDownloads(packageName) {
  try {
    const response = await fetch(`https://api.npmjs.org/downloads/point/last-month/${packageName}`);
    if (!response.ok) return 0;
    const data = await response.json();
    return data.downloads || 0;
  } catch {
    return 0;
  }
}

export async function getPyPiPackageInfo(packageName) {
  try {
    const response = await fetch(`${PYPI_API}/${packageName}/json`);
    if (!response.ok) throw new Error('Package not found');
    
    const data = await response.json();
    const release = data.releases[data.info.version]?.[0] || {};
    
    return {
      name: data.info.name,
      version: data.info.version,
      description: data.info.summary,
      homepage: data.info.home_page,
      downloads: data.info.downloads?.last_day || 0,
      maintainer: data.info.maintainer,
      created: new Date(data.info.created),
      modified: new Date(release.upload_time),
      license: data.info.license,
    };
  } catch (error) {
    console.error('PyPI API error:', error);
    throw error;
  }
}

export async function getPackageDependencies(packageName, version, type = 'npm') {
  if (type === 'npm') {
    const response = await fetch(`${NPM_API}/${packageName}/${version}`);
    const data = await response.json();
    return Object.keys(data.dependencies || {});
  } else if (type === 'pypi') {
    // PyPI doesn't expose dependencies easily; use requires_dist if available
    const response = await fetch(`${PYPI_API}/${packageName}/json`);
    const data = await response.json();
    return data.info.requires_dist?.map(d => d.split(/[>=<~]/)[0].trim()) || [];
  }
}
```

---

## Feature #5: CVE Database Integration

**Time Estimate**: 6-8 hours  
**Dependencies**: Feature #2 (PostgreSQL)  
**Priority**: HIGH (security critical)

### Architecture
Query NVD (National Vulnerability Database) and Snyk APIs for vulnerability data.

### Step 1: Create CVE Service

Create `lib/server/cve.js`:

```javascript
const NVD_API = 'https://services.nvd.nist.gov/rest/json/cves/1.0';
const SNYK_API = 'https://api.snyk.io/v1';

export async function checkNpmVulnerabilities(packageName, version) {
  try {
    // Use Snyk's free vulnerability database
    const response = await fetch(
      `${SNYK_API}/test/npm/${packageName}/${version}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `token ${process.env.SNYK_TOKEN}`,
        },
      }
    );
    
    if (!response.ok) return { vulnerabilities: [], score: 100 };
    
    const data = await response.json();
    const vulnerabilities = data.vulnerabilities || [];
    
    // Calculate severity score
    const severityWeights = { critical: 50, high: 30, medium: 15, low: 5 };
    let severityScore = 100;
    
    for (const vuln of vulnerabilities) {
      severityScore -= severityWeights[vuln.severity] || 5;
    }
    
    return {
      vulnerabilities: vulnerabilities.map(v => ({
        id: v.id,
        title: v.title,
        severity: v.severity,
        cvssScore: v.cvssScore,
        description: v.description,
        recommendation: v.recommendation,
      })),
      score: Math.max(0, severityScore),
    };
  } catch (error) {
    console.error('Snyk API error:', error);
    return { vulnerabilities: [], score: 50 };
  }
}

export async function checkPyPiVulnerabilities(packageName, version) {
  try {
    // Use Safety DB for Python packages
    const response = await fetch(
      `https://api.safetygov.com/database?key=${process.env.SAFETY_DB_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: [{ name: packageName, version }] }),
      }
    );
    
    if (!response.ok) return { vulnerabilities: [], score: 100 };
    
    const data = await response.json();
    return {
      vulnerabilities: data.map(v => ({
        id: v.cve,
        title: v.advisory,
        severity: determineSeverity(v.severity),
        description: v.description,
      })),
      score: 100 - (data.length * 15),
    };
  } catch (error) {
    console.error('Safety DB error:', error);
    return { vulnerabilities: [], score: 50 };
  }
}

function determineSeverity(safetyScore) {
  if (safetyScore >= 9) return 'critical';
  if (safetyScore >= 7) return 'high';
  if (safetyScore >= 4) return 'medium';
  return 'low';
}

export async function searchNVD(keyword) {
  try {
    const response = await fetch(
      `${NVD_API}?keyword=${encodeURIComponent(keyword)}`
    );
    const data = await response.json();
    return data.result?.CVE_Items || [];
  } catch (error) {
    console.error('NVD API error:', error);
    return [];
  }
}
```

### Step 2: Environment Variables

```bash
# Add to .env
SNYK_TOKEN=xxxxxxxxxxxxxxxxxxxxx
SAFETY_DB_KEY=xxxxxxxxxxxxxxxxxxxxx
```

---

## Feature #6: Background Job Processor (Bull Queue)

**Time Estimate**: 8-10 hours  
**Dependencies**: Feature #2 (PostgreSQL)  
**Priority**: HIGH (enables async operations)

### Architecture
Async job queue for long-running scans, using Redis and Bull.

### Step 1: Install Dependencies

```bash
npm install bull redis ioredis
npm install -D @types/bull
```

### Step 2: Create Job Queue

Create `lib/server/jobs.js`:

```javascript
import Queue from 'bull';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Define job queues
export const scanQueue = new Queue('scans', {
  redis: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
  },
});

export const emailQueue = new Queue('emails', { redis });

// Scan job processor
scanQueue.process(async (job) => {
  const { assetId, workspaceId, url } = job.data;
  
  job.progress(10);
  
  try {
    // Call your analysis engines
    const results = await runAnalysis(workspaceId, assetId, url);
    
    job.progress(100);
    return results;
  } catch (error) {
    throw error;
  }
});

// Email job processor
emailQueue.process(async (job) => {
  const { to, subject, template, data } = job.data;
  
  try {
    await sendEmail(to, subject, template, data);
    return { sent: true };
  } catch (error) {
    throw error;
  }
});

// Event listeners
scanQueue.on('completed', (job) => {
  console.log(`Scan ${job.id} completed`);
  // Update database
});

scanQueue.on('failed', (job, error) => {
  console.error(`Scan ${job.id} failed:`, error);
});

export async function enqueueScan(workspaceId, assetId, url) {
  const job = await scanQueue.add(
    { assetId, workspaceId, url },
    { jobId: `scan-${assetId}-${Date.now()}` }
  );
  return job;
}

export async function enqueueEmail(to, subject, template, data) {
  const job = await emailQueue.add(
    { to, subject, template, data },
    { jobId: `email-${to}-${Date.now()}` }
  );
  return job;
}

async function runAnalysis(workspaceId, assetId, url) {
  // Implementation from Feature #3-5
  return { trust: 75, verdict: 'CONDITIONALLY_TRUSTED' };
}

async function sendEmail(to, subject, template, data) {
  // Implementation for Feature #7
  console.log(`Email to ${to}: ${subject}`);
}
```

### Step 3: Integrate with API

Update `api/scans.js`:

```javascript
import { enqueueScan } from '../lib/server/jobs.js';
import { query } from '../lib/server/db.js';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { workspaceId, assetId, url } = req.body;
    
    try {
      // Create scan run in DB
      const scanResult = await query(
        `INSERT INTO scan_runs (workspace_id, asset_id, status)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [workspaceId, assetId, 'pending']
      );
      
      const scanRun = scanResult.rows[0];
      
      // Enqueue async job
      const job = await enqueueScan(workspaceId, assetId, url);
      
      return res.json({ scanRun, jobId: job.id });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}
```

### Step 4: Azure Setup (Optional)

```bash
# Use Azure Container Apps Jobs for serverless execution
az containerapp job create \
  --name ventureos-scan-job \
  --resource-group ventureos \
  --environment ventureos-env \
  --image acr.azurecr.io/ventureos:latest \
  --trigger-type event \
  --replica-timeout 3600
```

---

## Feature #7: Email Delivery (SendGrid Integration)

**Time Estimate**: 4-6 hours  
**Dependencies**: Feature #6 (Job Queue)  
**Priority**: MEDIUM

### Architecture
Transactional emails for alerts, reports, and notifications.

### Step 1: Install SendGrid

```bash
npm install @sendgrid/mail
```

### Step 2: Create Email Service

Create `lib/server/email.js`:

```javascript
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendAlertEmail(user, alert) {
  const html = `
    <h2>⚠️ VentureOS Alert</h2>
    <p>High-risk finding detected for <strong>${alert.assetName}</strong></p>
    <p><strong>${alert.title}</strong></p>
    <p>${alert.description}</p>
    <p><a href="${process.env.APP_URL}/dashboard">View in Dashboard</a></p>
  `;
  
  return sgMail.send({
    to: user.email,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: `Alert: ${alert.assetName}`,
    html,
  });
}

export async function sendReportEmail(user, report) {
  const html = `
    <h2>📊 Your Monthly Report</h2>
    <p>Here's your trust summary for ${report.month}:</p>
    <ul>
      <li>Assets Analyzed: ${report.assetCount}</li>
      <li>Average Trust Score: ${report.avgScore}</li>
      <li>Critical Findings: ${report.criticalCount}</li>
    </ul>
    <p><a href="${process.env.APP_URL}/reports/${report.id}">Download Full Report</a></p>
  `;
  
  return sgMail.send({
    to: user.email,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: `VentureOS Report - ${report.month}`,
    html,
  });
}

export async function sendWelcomeEmail(user) {
  const html = `
    <h2>Welcome to VentureOS!</h2>
    <p>Hi ${user.name},</p>
    <p>Your workspace is ready to go. Start by analyzing your first asset.</p>
    <p><a href="${process.env.APP_URL}/analyze">Analyze an Asset</a></p>
  `;
  
  return sgMail.send({
    to: user.email,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: 'Welcome to VentureOS',
    html,
  });
}

export async function sendPassportEmail(user, passport) {
  const html = `
    <h2>✅ Your Passport is Ready</h2>
    <p><strong>${passport.assetName}</strong></p>
    <p>Trust Score: <strong>${passport.trustScore}/100</strong></p>
    <p>Verdict: <strong>${passport.verdict}</strong></p>
    <p><a href="${process.env.APP_URL}/passports/${passport.id}">View Passport</a></p>
  `;
  
  return sgMail.send({
    to: user.email,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: `Passport Issued: ${passport.assetName}`,
    html,
  });
}
```

### Step 3: Integrate Emails into Job Queue

Update `lib/server/jobs.js`:

```javascript
import { enqueueEmail } from './jobs.js';

// When scan completes
scanQueue.on('completed', async (job) => {
  const { workspaceId } = job.data;
  const user = await getUser(workspaceId);
  
  await enqueueEmail(
    user.email,
    'Scan Completed',
    'scan-complete',
    job.returnvalue
  );
});
```

---

## Feature #8: Webhook Event Streaming

**Time Estimate**: 6-8 hours  
**Dependencies**: Features #2, #6 (Database, Queue)  
**Priority**: MEDIUM

### Implementation
Real-time event pub/sub for workspace changes, scan completions, alerts.

Create `lib/server/events.js`:

```javascript
import { EventEmitter } from 'events';

const eventEmitter = new EventEmitter();

export function publishEvent(eventType, data) {
  eventEmitter.emit(eventType, data);
  
  // Store event in DB for audit trail
  storeEvent(eventType, data);
}

export function subscribeToEvent(eventType, callback) {
  eventEmitter.on(eventType, callback);
  return () => eventEmitter.off(eventType, callback);
}

// Event types
export const EVENTS = {
  SCAN_COMPLETED: 'scan.completed',
  PASSPORT_ISSUED: 'passport.issued',
  ALERT_TRIGGERED: 'alert.triggered',
  ASSET_ADDED: 'asset.added',
  FINDING_DISCOVERED: 'finding.discovered',
};

async function storeEvent(type, data) {
  await query(
    'INSERT INTO events (event_type, event_data) VALUES ($1, $2)',
    [type, JSON.stringify(data)]
  );
}
```

---

## Feature #9: PDF Report Generation

**Time Estimate**: 5-7 hours  
**Dependencies**: Feature #2 (Database)  
**Priority**: LOW (nice-to-have)

### Implementation
Using puppeteer or pdfkit for passport PDFs and executive reports.

```bash
npm install puppeteer
```

Create `lib/server/pdf.js`:

```javascript
import puppeteer from 'puppeteer';

export async function generatePassportPDF(passport) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Passport</title></head>
      <body>
        <h1>${passport.assetName}</h1>
        <p>Trust Score: ${passport.trustScore}/100</p>
        <p>Verdict: ${passport.verdict}</p>
      </body>
    </html>
  `;
  
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  const pdf = await page.pdf({ format: 'A4' });
  await browser.close();
  
  return pdf;
}
```

---

## Deployment Strategy

### Azure App Service Setup

```bash
# Create web app
az webapp create \
  --resource-group ventureos \
  --plan ventureos-plan \
  --name ventureos-app

# Configure environment variables
az webapp config appsettings set \
  --resource-group ventureos \
  --name ventureos-app \
  --settings DATABASE_URL=$DATABASE_URL GITHUB_TOKEN=$GITHUB_TOKEN
```

### Environment Variables Summary

```bash
# Database
DATABASE_URL=postgresql://...

# APIs
GITHUB_TOKEN=ghp_...
SNYK_TOKEN=...
SENDGRID_API_KEY=...

# Services
REDIS_URL=redis://...
APP_URL=https://ventureos.com
```

---

## Testing Checklist

- [ ] PostgreSQL migration succeeds, data persists
- [ ] GitHub API returns repo analysis
- [ ] CVE database queries complete <2s
- [ ] Background jobs queue and execute
- [ ] Emails send via SendGrid
- [ ] Webhooks fire and store events
- [ ] PDFs generate without errors
- [ ] All features work offline (graceful degradation)

---

## Success Metrics

- Response time <500ms for dashboards
- 99.9% uptime on core services
- <5s scan job queue time
- Email delivery rate >98%
- PDF generation <3s
- Zero data loss on failures

---

## Next Steps After Implementation

1. **Load Testing**: Simulate 1000+ concurrent users
2. **Security Audit**: Pen test APIs and auth
3. **Compliance**: Validate GDPR/SOC2 requirements
4. **Performance**: Optimize slow queries
5. **Documentation**: API docs, user guides
6. **Monitoring**: Set up Azure Application Insights
7. **Scaling**: Enable auto-scaling on App Service
