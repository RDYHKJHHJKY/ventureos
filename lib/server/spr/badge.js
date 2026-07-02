export const defaultBadgeConfig = {
  tiers: ['Restricted','Pending','Verified'],
  sections: ['Verified Identity','Software Lineage','Trust Score','Continuous Automation','Audit Ready Analysis','Secure by Design','Registration Globalization','Legal Compliance'],
  automationRules: [],
};

let _config = { ...defaultBadgeConfig };

function normalizeBadgeEvidence(evidence = {}) {
  const rawType = String(evidence.type || evidence.framework || evidence.evidenceType || 'generic').trim().toLowerCase();
  return {
    ...evidence,
    id: String(evidence.id || '').trim() || null,
    softwareId: String(evidence.softwareId || '').trim() || null,
    vendorId: String(evidence.vendorId || '').trim() || null,
    type: rawType === 'iso' || rawType === 'iso27001' ? 'iso27001' : rawType === 'slsa-provenance' ? 'slsa' : rawType === 'github' || rawType === 'repository' ? rawType : rawType,
    verificationStatus: String(evidence.verificationStatus || (evidence.verified ? 'verified' : 'pending')).trim().toLowerCase() || 'pending',
    verified: Boolean(evidence.verified === true || String(evidence.verificationStatus || '').trim().toLowerCase() === 'verified'),
    freshnessDays: Number(evidence.freshnessDays || 0),
    workspaceId: String(evidence.workspaceId || '').trim() || null,
    source: String(evidence.source || '').trim() || null,
    title: String(evidence.title || '').trim() || null,
    summary: String(evidence.summary || '').trim() || null,
  };
}

function normalizeBadgePassport(passport = {}) {
  return {
    ...passport,
    id: String(passport.id || '').trim() || null,
    softwareId: String(passport.softwareId || passport.assetId || '').trim() || null,
    vendorId: String(passport.vendorId || '').trim() || null,
    workspaceId: String(passport.workspaceId || '').trim() || null,
    evidenceIds: Array.isArray(passport.evidenceIds) ? passport.evidenceIds.map((item) => String(item || '').trim()).filter(Boolean) : [],
    trustScore: Number(passport.trustScore || 0),
    badge: String(passport.badge || '').trim() || null,
    evidenceSummary: String(passport.evidenceSummary || passport.summary || '').trim() || null,
  };
}

function createBadgeEvidenceId(prefix, key) {
  return String(`badge:${String(prefix || 'item').trim().toLowerCase()}:${String(key || '').trim()}`)
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9:-]/g, '')
    .toLowerCase();
}

function createBadgeEvidenceItem(item = {}) {
  return normalizeBadgeEvidence(item);
}

function gatherSoftwareEvidence(passport, software) {
  if (!software || !passport) return [];
  const evidenceItems = [];

  if (software.repositoryUrl) {
    evidenceItems.push(createBadgeEvidenceItem({
      id: createBadgeEvidenceId('software-repository', software.repositoryUrl),
      softwareId: passport.softwareId,
      vendorId: passport.vendorId,
      type: 'repository',
      freshnessDays: 0,
      verified: true,
      title: 'Software repository',
      source: `software:${passport.softwareId}`,
      summary: `Repository ${software.repositoryUrl}`,
      workspaceId: passport.workspaceId,
    }));
  }

  if (software.packageName) {
    evidenceItems.push(createBadgeEvidenceItem({
      id: createBadgeEvidenceId('software-package', software.packageName),
      softwareId: passport.softwareId,
      vendorId: passport.vendorId,
      type: 'package',
      freshnessDays: 0,
      verified: true,
      title: 'Software package metadata',
      source: `software:${passport.softwareId}`,
      summary: `Package ${software.packageName}`,
      workspaceId: passport.workspaceId,
    }));
  }

  return evidenceItems;
}

function gatherVendorEvidence(passport, vendor) {
  if (!vendor || !passport) return [];
  const evidenceItems = [];
  const claims = Array.isArray(vendor.complianceClaims) ? vendor.complianceClaims : [];

  for (const claim of claims) {
    const type = String(claim || 'vendor-claim').trim().toLowerCase();
    evidenceItems.push(createBadgeEvidenceItem({
      id: createBadgeEvidenceId('vendor-claim', `${vendor.id}:${type}`),
      softwareId: passport.softwareId,
      vendorId: vendor.id,
      type,
      freshnessDays: 0,
      verified: true,
      title: `Vendor compliance claim: ${claim}`,
      source: `vendor:${vendor.id}`,
      summary: `Vendor ${vendor.name} claims ${claim} compliance.`,
      workspaceId: passport.workspaceId,
    }));
  }

  return evidenceItems;
}

function resolveBadgeEvidence(db, passport, software, vendor) {
  const allEvidence = Array.isArray(db.sprEvidence) ? db.sprEvidence : [];
  if (!passport) return [];

  const evidenceFromPassport = allEvidence
    .filter((item) => {
      if (!item || typeof item !== 'object') return false;
      if (passport.evidenceIds.includes(String(item.id || '').trim())) return true;
      if (passport.softwareId && String(item.softwareId || '').trim() === passport.softwareId) return true;
      if (passport.vendorId && String(item.vendorId || '').trim() === passport.vendorId) return true;
      return false;
    })
    .map(normalizeBadgeEvidence);

  const projectEvidence = gatherProjectEvidence(db, passport, software, vendor);
  const softwareEvidence = gatherSoftwareEvidence(passport, software);
  const vendorEvidence = gatherVendorEvidence(passport, vendor);

  const deduped = new Map();
  for (const item of evidenceFromPassport.concat(projectEvidence, softwareEvidence, vendorEvidence)) {
    if (!item || !item.id) continue;
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item);
    }
  }

  return Array.from(deduped.values());
}

const IDENTITY_EVIDENCE_TYPES = new Set(['github', 'repository', 'identity', 'certificate', 'domain', 'email']);
const LINEAGE_EVIDENCE_TYPES = new Set(['sbom', 'slsa', 'repository', 'github', 'package-list', 'provenance', 'package', 'signal']);
const AUTOMATION_EVIDENCE_TYPES = new Set(['sbom', 'slsa', 'sigstore', 'package-list', 'package']);
const AUDIT_EVIDENCE_TYPES = new Set(['soc2', 'iso27001', 'fedramp', 'nist', 'audit', 'vendor-claim']);
const SECURITY_EVIDENCE_TYPES = new Set(['signal', 'cve', 'sbom', 'slsa']);
const COMPLIANCE_EVIDENCE_TYPES = new Set(['soc2', 'iso27001', 'fedramp', 'nist', 'vendor-claim']);

function normalizeEvidenceType(type) {
  return String(type || '').trim().toLowerCase();
}

function hasEvidenceType(evidence, typeSet) {
  if (!Array.isArray(evidence) || evidence.length === 0) return false;
  return evidence.some((item) => typeSet.has(normalizeEvidenceType(item?.type)));
}

async function resolveLineage(db, passport) {
  return {
    vendor: passport.vendorId ? (db.sprVendors || []).find((item) => item.id === passport.vendorId) || null : null,
    software: passport.softwareId ? (db.sprSoftware || []).find((item) => item.id === passport.softwareId) || null : null,
    project: passport.projectId ? (db.sprProjects || []).find((item) => item.id === passport.projectId) || null : null,
    workspace: passport.workspaceId ? (db.sprWorkspaces || []).find((item) => item.id === passport.workspaceId) || null : null,
  };
}

function extractLineageEvidence(lineage = {}) {
  const out = [];
  if (Array.isArray(lineage.vendor?.evidence)) {
    out.push(...lineage.vendor.evidence.map((e) => ({ ...e, source: 'vendor' })));
  }
  if (Array.isArray(lineage.software?.evidence)) {
    out.push(...lineage.software.evidence.map((e) => ({ ...e, source: 'software' })));
  }
  if (Array.isArray(lineage.project?.evidence)) {
    out.push(...lineage.project.evidence.map((e) => ({ ...e, source: 'project' })));
  }
  if (Array.isArray(lineage.workspace?.policyEvidence)) {
    out.push(...lineage.workspace.policyEvidence.map((e) => ({ ...e, source: 'workspace' })));
  }
  return out;
}

function getCanonicalEvidenceSource(evidence = {}) {
  const type = normalizeEvidenceType(evidence.type);
  const source = String(evidence.source || '').trim();

  if (source.startsWith('project:')) return 'project';
  if (source.startsWith('workspace:')) return 'workspace';
  if (source.startsWith('vendor:')) return 'vendor';
  if (source.startsWith('software:')) return 'software';
  if (source.startsWith('passport:')) return 'passport';

  if (['sbom', 'slsa', 'github', 'repository', 'package-list', 'package', 'provenance'].includes(type)) return 'software';
  if (['soc2', 'iso27001', 'fedramp', 'nist', 'vendor-claim'].includes(type)) return 'vendor';
  if (type === 'signal' || type === 'cve') return 'project';
  if (evidence.workspaceId) return 'workspace';
  if (evidence.vendorId) return 'vendor';
  if (evidence.softwareId) return 'software';

  return 'metadata';
}

function getBadgeSectionKey(section = {}) {
  const normalizedId = String(section.id || section.title || '').trim().toLowerCase();
  switch (normalizedId) {
    case 'verifiedidentity':
    case 'verified identity':
      return 'passport';
    case 'softwarelineage':
    case 'software lineage':
      return 'software';
    case 'trustscore':
    case 'trust score':
      return 'metadata';
    case 'continuousautomation':
    case 'continuous automation':
      return 'software';
    case 'auditreadyanalysis':
    case 'audit ready analysis':
      return 'project';
    case 'securebydesign':
    case 'secure by design':
      return 'software';
    case 'registrationglobalization':
    case 'registration globalization':
      return 'workspace';
    case 'legalcompliance':
    case 'legal compliance':
      return 'vendor';
    default:
      return 'metadata';
  }
}

function summarizeEvidenceSources(section, unifiedEvidence = []) {
  const sources = new Set();
  const requirements = Array.isArray(section.requirements) ? section.requirements : [];

  for (const req of requirements) {
    const matched = unifiedEvidence.filter((e) => String(e.id || '') === String(req.id || ''));
    matched.forEach((e) => {
      if (e?.source) {
        sources.add(e.source);
      }
    });
  }

  if (sources.size === 0) {
    return [getBadgeSectionKey(section)];
  }

  return Array.from(sources).sort();
}

function buildSectionResult({ complete, score = 0, detail = '', missing = [] } = {}) {
  const hasEvidence = Array.isArray(missing) && missing.length === 0 ? true : false;
  const status = complete ? 'complete' : hasEvidence ? 'warning' : 'incomplete';
  return {
    status,
    score: Number(Number(score || 0).toFixed(0)),
    detail: String(detail || '').trim(),
    missing: Array.isArray(missing) ? missing : [],
  };
}

function resolveBadgeSections(config) {
  const sectionTitles = Array.isArray(config?.sections) ? config.sections : defaultBadgeConfig.sections;
  return sectionTitles.map((sectionTitle) => {
    const id = String(sectionTitle || 'unknown').replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
    const normalizedId = String(id || '').toLowerCase();

    const evaluate = ({ passport, software, vendor, evidence }) => {
      const hasIdentityEvidence = hasEvidenceType(evidence, IDENTITY_EVIDENCE_TYPES) || Boolean(software?.repositoryUrl) || Boolean(passport?.evidenceIds?.length);
      const hasLineageEvidence = hasEvidenceType(evidence, LINEAGE_EVIDENCE_TYPES);
      const hasAutomationEvidence = hasEvidenceType(evidence, AUTOMATION_EVIDENCE_TYPES);
      const hasAuditEvidence = hasEvidenceType(evidence, AUDIT_EVIDENCE_TYPES) || Boolean(vendor?.complianceClaims?.length);
      const hasSecurityEvidence = hasEvidenceType(evidence, SECURITY_EVIDENCE_TYPES);
      const hasComplianceEvidence = hasEvidenceType(evidence, COMPLIANCE_EVIDENCE_TYPES) || Boolean(vendor?.complianceClaims?.length);
      const workspacePresent = Boolean(passport?.workspaceId);
      const trustScore = Number(passport?.trustScore || 0);

      switch (normalizedId) {
        case 'verifiedidentity': {
          const complete = hasIdentityEvidence;
          return buildSectionResult({
            complete,
            score: complete ? 100 : 0,
            detail: complete ? 'Identity evidence has been resolved from passport and software metadata.' : 'No identity or registry evidence is available for this passport.',
            missing: complete ? [] : ['Identity verification evidence is required.'],
          });
        }
        case 'softwarelineage': {
          const complete = hasLineageEvidence;
          return buildSectionResult({
            complete,
            score: complete ? 100 : hasAutomationEvidence ? 50 : 0,
            detail: complete ? 'Software lineage evidence was detected from repository, SBOM, provenance, or project metadata.' : 'Software lineage evidence is missing.',
            missing: complete ? [] : ['Add SBOM, provenance, repository, or project lineage evidence to verify software lineage.'],
          });
        }
        case 'trustscore': {
          const complete = trustScore >= 60;
          return buildSectionResult({
            complete,
            score: complete ? Math.min(100, trustScore) : Math.max(0, trustScore),
            detail: `Trust score is ${trustScore}.`,
            missing: complete ? [] : ['Trust score below the minimum threshold.'],
          });
        }
        case 'continuousautomation': {
          const complete = hasAutomationEvidence;
          return buildSectionResult({
            complete,
            score: complete ? 100 : hasLineageEvidence ? 50 : 0,
            detail: complete ? 'Continuous automation evidence is present through SBOM, provenance, or build metadata.' : 'Automation evidence is not available.',
            missing: complete ? [] : ['Provide SBOM, SLSA provenance, or build verification evidence for continuous automation.'],
          });
        }
        case 'auditreadyanalysis': {
          const complete = hasAuditEvidence;
          return buildSectionResult({
            complete,
            score: complete ? 100 : hasSecurityEvidence ? 50 : 0,
            detail: complete ? 'Audit-ready evidence is available from standards or compliance claims.' : 'Audit evidence is missing.',
            missing: complete ? [] : ['Collect audit or compliance documentation to meet audit-ready analysis requirements.'],
          });
        }
        case 'securebydesign': {
          const complete = hasSecurityEvidence;
          return buildSectionResult({
            complete,
            score: complete ? 100 : hasLineageEvidence ? 50 : 0,
            detail: complete ? 'Secure-by-design evidence is available from security signals and project controls.' : 'Security posture evidence is missing.',
            missing: complete ? [] : ['Add security signals, CVE context, or secure design evidence.'],
          });
        }
        case 'registrationglobalization': {
          const complete = workspacePresent;
          return buildSectionResult({
            complete,
            score: complete ? 100 : 0,
            detail: complete ? 'Workspace registration and localization evidence is available.' : 'Workspace or registration context is missing.',
            missing: complete ? [] : ['Associate this passport to a workspace or registration scope.'],
          });
        }
        case 'legalcompliance': {
          const complete = hasComplianceEvidence;
          return buildSectionResult({
            complete,
            score: complete ? 100 : 0,
            detail: complete ? 'Legal compliance evidence is present through vendor claims or compliance documents.' : 'Legal compliance evidence is missing.',
            missing: complete ? [] : ['Provide legal compliance evidence such as SOC 2, ISO 27001, or equivalent vendor claims.'],
          });
        }
        default:
          return buildSectionResult({
            complete: false,
            score: 0,
            detail: 'Section has no evaluation rule.',
            missing: ['This section is not configured for evaluation.'],
          });
      }
    };

    const descriptions = {
      verifiedIdentity: 'View passport identity evidence and verification status.',
      softwareLineage: 'Inspect software registry, dependency lineage, and vendor metadata.',
      trustScore: 'Review trust score dashboards and asset confidence signals.',
      continuousAutomation: 'Open evidence pipeline and project automation controls.',
      auditReadyAnalysis: 'Review audit readiness from compliance and standards evidence.',
      secureByDesign: 'Confirm security posture through design and runtime signals.',
      registrationGlobalization: 'Validate workspace registration and global compliance scope.',
      legalCompliance: 'Verify legal and regulatory compliance sources for this asset.',
    };

    return {
      id,
      title: sectionTitle,
      description: descriptions[normalizedId] || '',
      target: 'passports',
      evaluate,
    };
  });
}

function gatherPassportEvidence(db, passport, software, vendor) {
  return resolveBadgeEvidence(db, passport, software, vendor);
}

export function getBadgeConfig(db = {}) {
  return _config;
}

export function setBadgeConfig(db = {}, config = {}) {
  _config = { ..._config, ...config };
  return _config;
}

export function assignBadgeToPassport(db = {}, passportId, level) {
  const passport = (db.sprPassports || []).find((p) => p.id === passportId);
  if (!passport) {
    const err = new Error('Passport not found.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  passport.badge = String(level || '').trim() || null;
  passport.updatedAt = new Date().toISOString();
  return passport;
}

export async function getBadgeRequirements(db = {}, passportId) {
  const passportRecord = (db.sprPassports || []).find((p) => p.id === passportId);
  if (!passportRecord) return null;
  const passport = normalizeBadgePassport(passportRecord);
  const software = (db.sprSoftware || []).find((item) => item.id === passport.softwareId) || null;
  const vendor = (db.sprVendors || []).find((item) => item.id === passport.vendorId) || null;
  const evidence = gatherPassportEvidence(db, passport, software, vendor);

  const passportEvidence = (passport.evidenceIds || []).map((id) => ({ id, source: 'passport' }));
  const assetEvidence = Array.isArray(passport.assets)
    ? passport.assets.flatMap((asset) =>
        Array.isArray(asset.evidence)
          ? asset.evidence.map((e) => ({ ...e, source: 'asset' }))
          : []
      )
    : [];

  const lineage = await resolveLineage(db, passport);
  const lineageEvidence = extractLineageEvidence(lineage);

  const unifiedEvidence = [];
  const evidenceById = new Map();

  for (const item of evidence) {
    if (item && item.id) {
      evidenceById.set(String(item.id), item);
    }
  }
  for (const item of [...passportEvidence, ...assetEvidence, ...lineageEvidence]) {
    if (!item || !item.id) continue;
    const key = String(item.id);
    if (!evidenceById.has(key)) {
      evidenceById.set(key, item);
    }
  }
  unifiedEvidence.push(...evidenceById.values());

  const sections = resolveBadgeSections(_config).map((section) => {
    const result = section.evaluate({ passport, software, vendor, evidence: unifiedEvidence });
    return {
      id: section.id,
      title: section.title,
      description: section.description,
      target: section.target,
      status: result.status || 'incomplete',
      score: Number(result.score || 0),
      detail: String(result.detail || '').trim(),
      missing: Array.isArray(result.missing) ? result.missing : [],
      sources: summarizeEvidenceSources(section, unifiedEvidence),
    };
  });
  const completedSections = sections.filter((item) => item.status === 'complete').length;
  const allComplete = completedSections === sections.length;
  const score = Math.round((completedSections / Math.max(1, sections.length)) * 100);
  return {
    passportId: passport.id,
    badge: passport.badge || null,
    trustScore: Number(passport.trustScore || 0),
    completedSections,
    sectionCount: sections.length,
    overallStatus: allComplete ? 'complete' : 'incomplete',
    score,
    sections,
  };
}

export async function evaluateBadgeAutomation(db = {}, passportId) {
  const passport = (db.sprPassports || []).find((p) => p.id === passportId);
  if (!passport) return null;
  const requirements = await getBadgeRequirements(db, passportId);
  if (!requirements) return null;
  const completed = requirements.completedSections;
  const required = requirements.sectionCount;
  const trustScore = Number(passport.trustScore || 0);
  if (completed === required && trustScore >= 75) {
    passport.badge = 'Verified';
  } else if (completed >= Math.ceil(required * 0.6) && trustScore >= 60) {
    passport.badge = 'Pending';
  } else {
    passport.badge = 'Restricted';
  }
  passport.updatedAt = new Date().toISOString();
  return passport;
}
