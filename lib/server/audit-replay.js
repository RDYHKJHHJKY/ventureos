import { createHash } from "node:crypto";
import { createPassportEnvelopeHash } from "./passport-assembler.js";
import { trustScore } from "./trust-score.js";
import { computeProjectSignals, computePipelineScore } from "./project-pipeline.js";

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function hashObject(value) {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function sortById(items = []) {
  return Array.isArray(items) ? items.slice().sort((a, b) => String(a.id || "").localeCompare(String(b.id || ""))) : [];
}

function compareStable(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function normalizeReplayEvidenceItem(item = {}) {
  return {
    id: String(item.id || "").trim() || null,
    type: String(item.type || "generic").trim().toLowerCase() || "generic",
    title: String(item.title || "").trim() || null,
    summary: String(item.summary || "").trim() || null,
    source: String(item.source || "").trim() || null,
    uri: String(item.uri || "").trim() || null,
    strength: Number(item.strength || 0),
    freshnessDays: Number(item.freshnessDays || 0),
    verified: Boolean(item.verified),
    visibility: String(item.visibility || "public").trim().toLowerCase() || "public",
    accessToken: String(item.accessToken || null).trim() || null,
    workspaceId: String(item.workspaceId || "").trim() || null,
    vendorId: String(item.vendorId || "").trim() || null,
    trustScore: Number(item.trustScore || 0),
    createdAt: String(item.createdAt || "").trim() || null,
    updatedAt: String(item.updatedAt || "").trim() || null,
    numericSignals: item.numericSignals && typeof item.numericSignals === "object"
      ? Object.fromEntries(Object.entries(item.numericSignals).sort())
      : {},
    bundle: item.bundle && typeof item.bundle === "object"
      ? {
          integrityHash: String(item.bundle.integrityHash || null),
          requestId: String(item.bundle.requestId || null).trim() || null,
          workspaceId: String(item.bundle.workspaceId || "").trim() || null,
          encrypted: Boolean(item.bundle.encrypted),
          selectiveDisclosure: Boolean(item.bundle.selectiveDisclosure),
          recipients: Array.isArray(item.bundle.recipients)
            ? item.bundle.recipients.map((recipient) => String(recipient || "").trim()).filter(Boolean).sort()
            : [],
        }
      : null,
  };
}

function normalizeReplayInputs(inputs = {}) {
  const software = inputs.software && typeof inputs.software === "object" ? {
    id: String(inputs.software.id || "").trim() || null,
    repositoryUrl: String(inputs.software.repositoryUrl || inputs.software.repoUrl || "").trim() || null,
    packageName: String(inputs.software.packageName || inputs.software.name || "").trim() || null,
  } : { id: null, repositoryUrl: null, packageName: null };

  const vendor = inputs.vendor && typeof inputs.vendor === "object" ? {
    id: String(inputs.vendor.id || inputs.vendor.vendorId || "").trim() || null,
    complianceClaims: Array.isArray(inputs.vendor.complianceClaims)
      ? [...new Set(inputs.vendor.complianceClaims.map((claim) => String(claim || "").trim()).filter(Boolean))].sort()
      : [],
  } : { id: null, complianceClaims: [] };

  return {
    software,
    vendor,
    evidenceList: Array.isArray(inputs.evidenceList)
      ? sortById(inputs.evidenceList.map(normalizeReplayEvidenceItem))
      : [],
    profile: String(inputs.profile || "default").trim().toLowerCase() || "default",
    workspaceId: String(inputs.workspaceId || "").trim() || null,
    visibility: String(inputs.visibility || "public").trim().toLowerCase() || "public",
    accessToken: String(inputs.accessToken || null).trim() || null,
    scoringProfile: String(inputs.scoringProfile || inputs.profile || "default").trim().toLowerCase() || "default",
  };
}

function normalizeProjectDependency(dep = {}) {
  return {
    id: String(dep.id || "").trim() || null,
    packageName: String(dep.packageName || dep.name || "").trim() || null,
    version: String(dep.version || "").trim() || null,
    scope: String(dep.scope || "runtime").trim(),
    risk: String(dep.risk || "unknown").trim(),
    vendor: String(dep.vendor || "").trim() || null,
  };
}

function normalizeProjectMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") return {};
  return Object.fromEntries(Object.entries(metadata).sort());
}

function capturePassportIssueSnapshot({ passport, db } = {}) {
  if (!passport || !db) {
    throw new Error("Passport issuance capture requires passport and db.");
  }
  const software = (db.sprSoftware || []).find((item) => item.id === passport.softwareId) || {};
  const vendor = (db.sprVendors || []).find((item) => item.id === passport.vendorId) || {};
  const evidenceList = sortById((db.sprEvidence || []).filter((item) => Array.isArray(passport.evidenceIds) && passport.evidenceIds.includes(item.id)).map(normalizeReplayEvidenceItem));
  return {
    type: "passport.issue",
    passportId: String(passport.id || "").trim() || null,
    workspaceId: String(passport.workspaceId || "").trim() || null,
    inputs: normalizeReplayInputs({
      software,
      vendor,
      evidenceList,
      profile: passport.profile || passport.scoringProfile || "default",
      workspaceId: passport.workspaceId,
      visibility: passport.visibility,
      accessToken: passport.accessToken || null,
      scoringProfile: passport.scoringProfile || passport.profile || "default",
    }),
    outputs: {
      trustScore: Number(passport.trustScore || 0),
      confidenceScore: Number(passport.confidenceScore || 0),
      verdict: String(passport.verdict || "REVIEW").trim(),
      riskCategory: String(passport.riskCategory || "High").trim(),
      profile: String(passport.profile || passport.scoringProfile || "default").trim().toLowerCase() || "default",
    },
    envelope: {
      evidenceIds: Array.isArray(passport.evidenceIds) ? passport.evidenceIds.slice().sort() : [],
      trustGraphHash: String(passport.trustGraphHash || null),
      evidenceFreshnessHash: String(passport.evidenceFreshnessHash || null),
      evidenceBundleHash: String(passport.evidenceBundleHash || null),
      evidenceSummary: String(passport.evidenceSummary || "").trim() || null,
      passportEnvelopeVersion: Number(passport.passportEnvelopeVersion || 1),
      issuedAt: String(passport.issuedAt || passport.createdAt || new Date().toISOString()).trim() || null,
    },
    passportEnvelopeHash: String(passport.passportEnvelopeHash || null),
    trustScoreHash: String(passport.trustScoreHash || null),
  };
}

function capturePipelineRunSnapshot({ project, db, dependencies = [], metadata = {}, signals = {}, score = {}, runId = null } = {}) {
  if (!project || !db || !signals || !score) {
    throw new Error("Pipeline run capture requires project, db, signals, and score.");
  }
  return {
    type: "pipeline.run",
    runId: String(runId || `${project.id || "unknown"}-anonymous`).trim() || null,
    projectId: String(project.id || "").trim() || null,
    workspaceId: String(project.workspaceId || "").trim() || null,
    project: {
      id: String(project.id || "").trim() || null,
      name: String(project.name || "").trim() || null,
      vendor: String(project.vendor || "").trim() || null,
      sector: String(project.sector || "").trim() || null,
      repoUrl: String(project.repoUrl || "").trim() || null,
    },
    inputs: {
      dependencies: sortById((dependencies || []).map(normalizeProjectDependency)),
      metadata: normalizeProjectMetadata(metadata),
      hasSbom: Boolean(score.confidenceDetail?.hasSbom || score.hasSbom || false),
      hasPackageList: Boolean(score.confidenceDetail?.hasPackageList || score.hasPackageList || false),
      hasMetadata: Boolean(Object.keys(metadata || {}).length > 0),
      hasRepoUrl: Boolean(project.repoUrl),
    },
    signals: signals,
    score: score,
  };
}

function captureEvidenceIngestionSnapshot({ evidence, db } = {}) {
  if (!evidence || !db) {
    throw new Error("Evidence ingestion capture requires evidence and db.");
  }
  return {
    type: "evidence.ingest",
    evidence: normalizeReplayEvidenceItem(evidence),
  };
}

function captureEvidenceBundleSnapshot({ evidence, db } = {}) {
  if (!evidence || !db) {
    throw new Error("Evidence bundle capture requires evidence and db.");
  }
  return {
    type: "evidence.bundle",
    evidence: normalizeReplayEvidenceItem(evidence),
    bundle: evidence.bundle && typeof evidence.bundle === "object" ? {
      integrityHash: String(evidence.bundle.integrityHash || null),
      requestId: String(evidence.bundle.requestId || "").trim() || null,
      workspaceId: String(evidence.bundle.workspaceId || "").trim() || null,
      encrypted: Boolean(evidence.bundle.encrypted),
      selectiveDisclosure: Boolean(evidence.bundle.selectiveDisclosure),
      recipients: Array.isArray(evidence.bundle.recipients)
        ? evidence.bundle.recipients.map((recipient) => String(recipient || "").trim()).filter(Boolean).sort()
        : [],
    } : null,
  };
}

export function buildPassportIssueReplaySnapshot({
  passportId,
  software,
  vendor,
  evidenceList,
  profile,
  workspaceId,
  scoringProfile,
  visibility,
  accessToken,
  evidenceIds,
  trustGraphHash,
  evidenceFreshnessHash,
  evidenceBundleHash,
  evidenceSummary,
  passportEnvelopeVersion,
  issuedAt,
  passportEnvelopeHash,
  trustScoreHash,
  deterministic,
} = {}) {
  const inputs = normalizeReplayInputs({ software, vendor, evidenceList, profile, workspaceId, visibility, accessToken, scoringProfile });
  const envelope = {
    passportId: String(passportId || "").trim() || null,
    identity: inputs.software.id || null,
    evidenceIds: Array.isArray(evidenceIds) ? evidenceIds.slice().sort() : [],
    visibility: inputs.visibility,
    scoringProfile: inputs.scoringProfile,
    issuedAt: String(issuedAt || new Date().toISOString()).trim() || null,
    passportEnvelopeVersion: Number(passportEnvelopeVersion || 1),
    trustGraphHash: String(trustGraphHash || null),
    evidenceFreshnessHash: String(evidenceFreshnessHash || null),
    evidenceBundleHash: String(evidenceBundleHash || null),
    evidenceSummary: String(evidenceSummary || "").trim() || null,
  };

  return {
    type: "passport.issue",
    passportId: envelope.passportId,
    inputs,
    outputs: {
      trustScore: Number(deterministic?.trustScore || 0),
      confidenceScore: Number(deterministic?.confidenceScore || 0),
      verdict: String(deterministic?.verdict || "REVIEW").trim(),
      riskCategory: String(deterministic?.riskCategory || "High").trim(),
      profile: String(deterministic?.profile || inputs.profile).trim().toLowerCase() || "default",
    },
    envelope,
    passportEnvelopeHash: String(passportEnvelopeHash || null),
    trustScoreHash: String(trustScoreHash || null),
  };
}

export function replayPassportIssueSnapshot(snapshot = {}, db = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, reason: "Missing replay snapshot." };
  }

  const normalizedInputs = trustScore.normalizeInputs({
    software: snapshot.inputs?.software || {},
    vendor: snapshot.inputs?.vendor || {},
    evidenceList: snapshot.inputs?.evidenceList || [],
    profile: snapshot.inputs?.profile || "default",
    workspaceId: snapshot.inputs?.workspaceId || null,
  });
  const computed = trustScore.computeDeterministic(normalizedInputs);
  const reconstructedPassport = {
    id: snapshot.passportId,
    softwareId: snapshot.envelope.identity,
    evidenceIds: Array.isArray(snapshot.envelope.evidenceIds) ? snapshot.envelope.evidenceIds.slice() : [],
    visibility: snapshot.envelope.visibility,
    scoringProfile: snapshot.envelope.scoringProfile,
    issuedAt: snapshot.envelope.issuedAt,
    passportEnvelopeVersion: snapshot.envelope.passportEnvelopeVersion,
    trustGraphHash: snapshot.envelope.trustGraphHash,
    evidenceFreshnessHash: snapshot.envelope.evidenceFreshnessHash,
    evidenceSummary: snapshot.envelope.evidenceSummary,
  };
  const envelopeHashComputed = createPassportEnvelopeHash(reconstructedPassport);
  const envelopeMatch = envelopeHashComputed === snapshot.passportEnvelopeHash;
  const scoreHashComputed = trustScore.hashOutput({
    scoreResult: computed,
    workspaceId: snapshot.inputs?.workspaceId,
    passportEnvelopeHash: snapshot.passportEnvelopeHash,
  });
  const scoreHashMatch = scoreHashComputed === snapshot.trustScoreHash;
  const evidenceMatch = Array.isArray(snapshot.inputs?.evidenceList)
    ? snapshot.inputs.evidenceList.every((item) => {
        const current = (db.sprEvidence || []).find((evidence) => evidence.id === item.id);
        return Boolean(current && compareStable(normalizeReplayEvidenceItem(current), item));
      })
    : true;

  const outputsMatch =
    Number(snapshot.outputs?.trustScore || 0) === computed.trustScore &&
    Number(snapshot.outputs?.confidenceScore || 0) === computed.confidenceScore &&
    String(snapshot.outputs?.verdict || "").trim() === computed.verdict &&
    String(snapshot.outputs?.riskCategory || "").trim() === computed.riskCategory &&
    String(snapshot.outputs?.profile || "").trim().toLowerCase() === computed.profile;

  return {
    type: "passport.issue",
    ok: envelopeMatch && scoreHashMatch && outputsMatch && evidenceMatch,
    envelopeMatch,
    scoreHashMatch,
    outputsMatch,
    evidenceMatch,
    envelopeHashComputed,
    scoreHashComputed,
    computed,
    expected: snapshot.outputs,
    snapshot,
  };
}

function replayPipelineRunSnapshot(snapshot = {}, db = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, reason: "Missing pipeline replay snapshot." };
  }
  const project = (db.projects || []).find((item) => item.id === snapshot.projectId) || null;
  if (!project) {
    return { ok: false, reason: "Project not found.", projectId: snapshot.projectId };
  }
  const dependencies = (db.projectDependencies || []).filter((item) => item.projectId === snapshot.projectId);
  const metadataItem = (db.projectMetadata || []).find((item) => item.projectId === snapshot.projectId);
  const metadata = metadataItem?.data || {};
  const signals = computeProjectSignals(db, project, dependencies, metadata);
  const score = computePipelineScore(signals, {
    hasSbom: Boolean(snapshot.inputs?.hasSbom),
    hasPackageList: Boolean(snapshot.inputs?.hasPackageList),
    hasMetadata: Boolean(snapshot.inputs?.hasMetadata),
    hasRepoUrl: Boolean(snapshot.inputs?.hasRepoUrl),
  });
  const outputsMatch = compareStable(snapshot.signals, signals) && compareStable(snapshot.score, score);
  return {
    type: "pipeline.run",
    ok: outputsMatch,
    projectId: snapshot.projectId,
    runId: snapshot.runId,
    expectedSignals: snapshot.signals,
    expectedScore: snapshot.score,
    signals,
    score,
  };
}

function replayEvidenceSnapshot(snapshot = {}, db = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, reason: "Missing evidence replay snapshot." };
  }
  const evidence = (db.sprEvidence || []).find((item) => item.id === snapshot.evidence?.id) || null;
  if (!evidence) {
    return { ok: false, reason: "Evidence not found.", evidenceId: snapshot.evidence?.id };
  }
  const normalizedSnapshotEvidence = normalizeReplayEvidenceItem(snapshot.evidence || {});
  const normalizedEvidence = normalizeReplayEvidenceItem(evidence);
  const evidenceMatch = compareStable(normalizedSnapshotEvidence, normalizedEvidence);
  const bundleMatch = snapshot.bundle ? compareStable(snapshot.bundle, evidence.bundle || {}) : true;
  return {
    type: snapshot.type,
    ok: evidenceMatch && bundleMatch,
    evidenceId: normalizedSnapshotEvidence.id,
    evidenceMatch,
    bundleMatch,
    snapshotEvidence: normalizedSnapshotEvidence,
    currentEvidence: normalizedEvidence,
  };
}

export function capture(eventType, details = {}) {
  if (eventType === "passport.issue") {
    return capturePassportIssueSnapshot(details);
  }
  if (eventType === "pipeline.run") {
    return capturePipelineRunSnapshot(details);
  }
  if (eventType === "evidence.ingest") {
    return captureEvidenceIngestionSnapshot(details);
  }
  if (eventType === "evidence.bundle") {
    return captureEvidenceBundleSnapshot(details);
  }
  throw new Error(`Unsupported audit replay event type: ${eventType}`);
}

export function replay(snapshot = {}, db = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, reason: "Missing replay snapshot." };
  }
  if (snapshot.type === "passport.issue") {
    return replayPassportIssueSnapshot(snapshot, db);
  }
  if (snapshot.type === "pipeline.run") {
    return replayPipelineRunSnapshot(snapshot, db);
  }
  if (snapshot.type === "evidence.ingest" || snapshot.type === "evidence.bundle") {
    return replayEvidenceSnapshot(snapshot, db);
  }
  return { ok: false, reason: `Unsupported replay type: ${snapshot.type}` };
}

export function verify(snapshot = {}, db = {}) {
  const result = replay(snapshot, db);
  return { ok: result.ok === true, snapshotType: snapshot?.type || null, replay: result };
}

export const auditReplay = {
  buildPassportIssueReplaySnapshot,
  replayPassportIssueSnapshot,
  capture,
  replay,
  verify,
  hashObject,
};
