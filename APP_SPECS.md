# VentureOS App Specs

## Product Summary

VentureOS is a software trust intelligence platform for evaluating third-party software, internal services, open-source packages, and SaaS vendors. It turns technical, security, business, and product signals into trust scores, evidence trails, software passports, alerts, and board-ready reports.

The current app is a Vite + React single-page application with a polished dark dashboard shell. It includes frontend workflows for asset analysis, registry browsing, software passports, monitoring, reports, alerts, and team views.

## Target Users

- Startup CTOs and engineering leaders evaluating vendor or open-source risk.
- Security teams monitoring dependency, repository, and supplier health.
- Procurement and due diligence teams comparing vendors before purchase.
- Investors and operators reviewing technical risk across a portfolio.
- SaaS companies that want public trust badges and shareable software passports.

## Core Jobs

- Analyze a software asset by URL, domain, repository, package name, or vendor.
- Generate a clear trust score with explainable evidence.
- Separate security, engineering, business, product, and trust findings.
- Issue a shareable software passport for trusted or conditionally trusted assets.
- Embed a public trust badge on external websites.
- Monitor assets over time and alert teams when risk changes.
- Export diligence reports for buyers, investors, auditors, and internal review.

## Navigation

Primary nav:

- Dashboard
- Analyze
- Registry
- Passports

Workspace nav:

- Monitoring
- Reports
- Alerts
- Team

## Current Implementation

Tech stack:

- React 19
- Vite 5
- JavaScript JSX
- Inline component styles
- Static badge script at `public/api/badge.js`
- Google Ads conversion tag and SecurePrivacy script in `index.html`

Main files:

- `src/main.jsx`: React entrypoint.
- `src/App.jsx`: full app shell, UI components, mock data, analysis workflow, passport generation, exports.
- `public/api/badge.js`: embeddable VentureOS Verified badge script.

Existing frontend features:

- Sticky top navigation and left sidebar.
- Responsive dashboard metrics and recent analyses.
- Multi-step analysis workflow.
- Simulated asset discovery from a URL.
- Simulated scanning progress across Security, Engineering, Business, Product, and Trust engines.
- Result tabs for overview, security, engineering, business, and evidence.
- JSON report export.
- Generated passport creation from analysis results.
- Passport detail page with export and embed code.
- Badge embed generation and clipboard copy.
- Static registry table.
- Placeholder workspace pages for monitoring, reports, alerts, and team.

Current limitation:

- Analysis, evidence, alerts, registry data, and monitoring are frontend-simulated. Production requires real backend services, persistence, ingestion, scoring, and authenticated users.

## Product Modules

### 1. Dashboard

Purpose:

- Show trust intelligence at portfolio level.

Key UI:

- Asset count.
- Average trust score.
- Active alerts.
- Passports issued.
- Recent analyses table.
- Active alerts list.
- New Analysis entry point.

Production requirements:

- Metrics must be calculated from stored assets and scan runs.
- Recent analyses must link to scan result details.
- Alerts must be queryable by severity, status, owner, and asset.
- Dashboard data must load with skeleton states and recoverable error states.

### 2. Analyze Workflow

Purpose:

- Run a guided trust analysis on a software asset.

Input types:

- GitHub repository URL.
- Website or SaaS domain.
- NPM/PyPI/package URL.
- Internal service URL.
- Vendor/company name.

Current steps:

1. Input
2. Discovery
3. Configure
4. Analysis
5. Results

Production behavior:

- Validate and normalize user input.
- Identify asset type and owner.
- Discover domains, repositories, packages, dependencies, docs, licenses, and metadata.
- Let user configure scan depth and risk categories.
- Run scan engines asynchronously.
- Stream status updates to the UI.
- Persist every scan run and evidence item.
- Generate final trust score, confidence score, verdict, and explanation.

Scan engines:

- Security: CVEs, dependencies, secret exposure, SSL, headers, vulnerability databases, malware/package risk.
- Engineering: commit cadence, release health, contributor activity, issue response, test signals, dependency freshness.
- Business: company profile, funding, customer signals, employee trend, legal/compliance signals.
- Product: uptime signals, docs quality, API maturity, changelog health, onboarding friction.
- Trust: weighted aggregate score, confidence, evidence quality, uncertainty flags.

Result output:

- Trust score from 0 to 100.
- Confidence score from 0 to 100.
- Verdict: Trusted, Conditionally Trusted, Review Required, High Risk, or Blocked.
- Findings grouped by severity and engine.
- Evidence trail with source attribution.
- AI-generated plain-language narrative.
- Exportable JSON report.
- Optional passport generation.

### 3. Asset Registry

Purpose:

- Maintain a searchable inventory of analyzed assets.

Current fields:

- Asset name.
- Type.
- Industry.
- Trust score.
- Risk.
- Monitoring status.

Production fields:

- Asset ID.
- Name.
- Canonical URL.
- Type.
- Owner/company.
- Industry.
- Repositories.
- Domains.
- Package identifiers.
- Latest trust score.
- Latest confidence score.
- Risk level.
- Passport status.
- Monitoring status.
- Last scanned timestamp.
- Created by.
- Workspace/team ID.

Required actions:

- Search assets.
- Filter by type, risk, score, status, and owner.
- Sort by score, last scan, and risk.
- Open asset detail.
- Start new scan.
- Enable or disable monitoring.

### 4. Software Passports

Purpose:

- Create verifiable trust records that can be exported or shared externally.

Current behavior:

- Static sample passports are shown.
- New generated passports can be added from a scan result during the session.
- Passport JSON can be exported.
- Badge embed code can be copied.

Production behavior:

- Persist passports server-side.
- Version passports by scan run and asset version.
- Include signed evidence hashes.
- Track passport status: Active, Review, Expired, Revoked.
- Support public read-only passport URLs.
- Support private/internal passports.
- Require permissions for issuing, revoking, and exporting.

Passport data:

- Passport ID.
- Asset ID.
- Asset name.
- Company.
- Version.
- Trust score.
- Confidence score.
- Verdict.
- Issue date.
- Expiration date.
- Issuer user ID.
- Evidence summary.
- Full evidence references.
- Badge embed script.
- Public verification URL.

### 5. Badge Embed

Purpose:

- Let trusted assets display a VentureOS Verified badge externally.

Current script:

- Reads `data-asset`.
- Inserts a styled anchor after the script tag.
- Links to `/?asset={assetId}`.

Production requirements:

- Link to a public passport verification route.
- Fetch live badge status from an API.
- Render status variants: Verified, Conditional, Review, Expired, Revoked.
- Avoid blocking host page rendering.
- Support light and dark themes.
- Include accessible labels.
- Prevent script injection and unsafe asset IDs.
- Cache badge lookups at the edge.

### 6. Monitoring

Purpose:

- Continuously watch assets for trust score changes and new risk events.

Production monitors:

- Dependency vulnerability changes.
- Repository activity drops.
- Ownership or maintainer changes.
- SSL/domain expiration.
- License changes.
- Package deprecation.
- Major version releases.
- Public breach or incident signals.
- Trust score drift.

Required UI:

- Active monitor list.
- Monitor frequency.
- Last check time.
- Next check time.
- Latest status.
- Alert policy.
- Owner assignment.

### 7. Alerts

Purpose:

- Prioritize trust and security changes that require action.

Alert fields:

- Alert ID.
- Asset ID.
- Severity.
- Category.
- Title.
- Description.
- Evidence links.
- Created timestamp.
- Status: Open, Acknowledged, In Progress, Resolved, Dismissed.
- Owner.
- SLA due date.

Required actions:

- Assign owner.
- Acknowledge.
- Resolve.
- Dismiss with reason.
- Open related scan result.
- Notify team integrations.

### 8. Reports

Purpose:

- Export diligence packets and executive summaries.

Report types:

- Technical due diligence.
- Vendor security review.
- Open-source dependency review.
- Portfolio risk summary.
- Passport evidence export.

Export formats:

- JSON.
- PDF.
- CSV for asset inventory.

Required sections:

- Executive summary.
- Trust score and verdict.
- Score breakdown.
- Key risks.
- Evidence trail.
- Remediation recommendations.
- Monitoring status.
- Appendix with raw signals.

### 9. Team And Access

Purpose:

- Manage workspace membership and review ownership.

Roles:

- Owner: billing, workspace, and all data access.
- Admin: team, assets, passports, and integrations.
- Reviewer: scans, findings, reports, alerts.
- Viewer: read-only dashboard, registry, reports, passports.

Required flows:

- Invite user.
- Accept invite.
- Remove user.
- Change role.
- Assign alert or asset owner.
- Audit role changes.

## Authentication Specs

Required production flows:

- Signup.
- Login.
- Logout.
- Session persistence.
- Password reset or OAuth provider.
- Protected app routes.
- Workspace selection.
- Account settings.

Security requirements:

- HttpOnly session cookies or secure auth provider SDK.
- CSRF protection where applicable.
- Rate limiting on auth endpoints.
- Server-side authorization checks.
- No secrets in frontend bundle.

## Backend Specs

Recommended production architecture:

- API server or serverless API routes.
- Postgres for relational data.
- Queue system for scan jobs.
- Object storage for report artifacts.
- Edge/cache layer for badge verification.
- Background scheduler for monitoring.

Core API resources:

- `/api/assets`
- `/api/scans`
- `/api/scans/:id/results`
- `/api/passports`
- `/api/passports/:id/public`
- `/api/badge/:assetId`
- `/api/alerts`
- `/api/reports`
- `/api/team`
- `/api/workspaces`

Core database tables:

- users
- workspaces
- workspace_members
- assets
- asset_sources
- scan_runs
- scan_findings
- evidence_items
- passports
- monitors
- alerts
- reports
- audit_events

## Scoring Specs

Score model:

- Security: 35%
- Engineering: 25%
- Business: 15%
- Product: 15%
- Evidence quality/confidence: 10%

Risk bands:

- 90-100: Trusted
- 75-89: Trusted
- 60-74: Conditionally Trusted
- 40-59: Review Required
- 20-39: High Risk
- 0-19: Blocked

Confidence factors:

- Number of independent evidence sources.
- Freshness of evidence.
- Source authority.
- Completeness of discovery.
- Agreement across signals.
- Scan errors or unavailable sources.

Finding severity:

- Critical: blocks approval or requires immediate action.
- High: serious risk requiring owner review.
- Medium: meaningful concern with remediation path.
- Low: minor hardening or hygiene item.
- Good: positive evidence that improves score.

## UX Specs

Design direction:

- Premium SaaS dashboard.
- Dark mode first, with future light mode support.
- Dense but readable operational UI.
- Fast scan status feedback.
- Clear severity color system.
- Evidence-first trust explanations.

Required states:

- Loading skeletons for dashboard, registry, passport, and report views.
- Empty states for new workspaces.
- Error states with retry actions.
- Form validation errors.
- Disabled states during scan execution.
- Success confirmations for exports, copies, and passport issuance.

Responsive behavior:

- Desktop: sidebar plus content workspace.
- Tablet: collapse dense grids to two columns.
- Mobile: hide sidebar, allow horizontal top nav, single-column cards and tables with horizontal scroll.

Accessibility:

- Keyboard navigable controls.
- Focus states on interactive elements.
- Semantic buttons and form fields.
- Sufficient contrast for risk badges.
- `aria-label` on icon-only or badge controls.

## Monetization Specs

Plans:

- Free: limited scans, basic reports, public badge preview.
- Pro: more scans, passports, monitoring, exports.
- Team: shared workspace, roles, alerts, integrations.
- Enterprise: SSO, audit logs, custom scoring, private deployment, priority support.

Billable units:

- Monthly seats.
- Scan credits.
- Monitored assets.
- Public passports.
- Advanced reports.

Upgrade triggers:

- Scan limit reached.
- Monitor limit reached.
- Team invite attempted on solo plan.
- PDF export requested.
- Private passport requested.

## Integrations

Priority integrations:

- GitHub repository metadata.
- NPM package metadata.
- OSV vulnerability database.
- GitHub Advisory Database.
- Domain and SSL lookup.
- Slack alert notifications.
- Stripe billing.
- PDF generation.

Future integrations:

- GitLab.
- Bitbucket.
- Jira.
- Linear.
- Snyk.
- Semgrep.
- Vercel deployment metadata.
- SOC 2 document storage.

## Quality Gates

Before release:

- Production build succeeds.
- No blank routes.
- Imports resolve.
- Main flows work on desktop and mobile.
- Forms validate invalid and valid input.
- Scan job failures surface usable errors.
- Passport export contains complete data.
- Badge script works on a separate test HTML page.
- Auth-protected routes reject anonymous users.
- API authorization is enforced server-side.
- Database migrations are repeatable.
- Monitoring jobs are idempotent.

## Near-Term Build Path

1. Convert the app from single-file JSX to modular TypeScript components.
2. Add persistent backend data models for assets, scans, findings, evidence, and passports.
3. Replace simulated scan logic with real asynchronous scan jobs.
4. Add authentication and workspace membership.
5. Implement asset detail pages and real registry search/filtering.
6. Add public passport verification routes and badge status API.
7. Add monitoring jobs and alert lifecycle management.
8. Add billing limits and upgrade flows.
9. Add PDF report exports.
10. Add automated tests for scan, passport, registry, and badge flows.

