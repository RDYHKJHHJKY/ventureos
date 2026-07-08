import {
  fetchGitHubRepo,
  fetchGitHubWorkflowFiles,
  fetchGitHubSbomArtifacts,
  fetchGitHubReleaseAssets,
  normalizeGitHubMetadata,
} from "../server/engines/github.js";
import { verifyReleaseAssetSignature } from "../server/sigstore.js";
import { parseSbomContent, downloadAndParseSbom } from "../server/sbom.js";

export async function classifyGitHubRepoSlsa(owner, repo) {
  const scannedAt = new Date().toISOString();
  // Test-mode shortcut: avoid network calls when TEST_SLSA_MOCK is set
  if (process.env.TEST_SLSA_MOCK === 'true') {
    const raw = { full_name: `${owner}/${repo}`, html_url: `https://github.com/${owner}/${repo}`, pushed_at: scannedAt, created_at: scannedAt };
    const normalizedMock = normalizeGitHubMetadata(raw, {
      repo: `${owner}/${repo}`,
      scannedAt,
      workflowFiles: [],
      sbomArtifacts: [],
      releaseAssets: [],
    });
    const classification = { status: 'insufficient_data', levelEstimate: null, confidence: 0, reasoning: ['TEST_SLSA_MOCK active'] };
    normalizedMock.slsaClassification = classification;
    return { normalized: normalizedMock, classification };
  }

  const raw = await fetchGitHubRepo(owner, repo);
  // Fetch auxiliary evidence in parallel; fall back to empty arrays on error
  const [workflowFiles, sbomArtifacts, releaseAssets] = await Promise.all([
    fetchGitHubWorkflowFiles(owner, repo).catch(() => []),
    fetchGitHubSbomArtifacts(owner, repo).catch(() => []),
    fetchGitHubReleaseAssets(owner, repo).catch(() => []),
  ]);

  const normalized = normalizeGitHubMetadata(raw, {
    repo: `${owner}/${repo}`,
    scannedAt,
    workflowFiles,
    sbomArtifacts,
    releaseAssets,
  });

  // Attempt signature verification for release assets when possible. This is best-effort.
  let verifiedSignatures = 0;
  try {
    // Attempt SBOM parsing/validation for each SBOM artifact, best-effort
    if (Array.isArray(sbomArtifacts) && sbomArtifacts.length > 0) {
      const parsedSboms = [];
      for (const sb of sbomArtifacts) {
        try {
          if (process.env.TEST_SLSA_MOCK === 'true') {
            // In mock mode, consider SBOM present but not validated
            parsedSboms.push({ name: sb.name, parsed: true, format: 'mock' });
          } else if (sb.downloadUrl) {
            const parsed = await downloadAndParseSbom(sb.downloadUrl).catch(() => null);
            if (parsed) parsedSboms.push({ name: sb.name, parsed: true, format: parsed.format, details: parsed });
          }
        } catch (err) {
          // ignore individual sbom parse failures
        }
      }
      if (parsedSboms.length > 0) {
        classification.sbomValidated = true;
        classification.sbomCount = parsedSboms.length;
        classification.reasoning = classification.reasoning || [];
        classification.reasoning.push(`Validated ${parsedSboms.length} SBOM artifact(s).`);
        classification.confidence = Math.max(classification.confidence || 0, 75);
      }
    }
    // Find signature assets and target assets by common basename
    const sigAssets = Array.isArray(releaseAssets) ? releaseAssets.filter((a) => /\.sig$|\.asc$|signed/i.test(String(a.name || ''))) : [];
    const nonSigAssets = Array.isArray(releaseAssets) ? releaseAssets.filter((a) => !/\.sig$|\.asc$|signed/i.test(String(a.name || ''))) : [];
    for (const sig of sigAssets) {
      // try to find matching non-sig by prefix
      const basename = String(sig.name || '').replace(/\.sig$|\.asc$|\.sig\.asc$|\.sig\.gz$|\.sig\.zip$/i, '');
      const candidate = nonSigAssets.find((a) => String(a.name || '').startsWith(basename) || String(a.name || '').includes(basename));
      if (candidate) {
        const res = await verifyReleaseAssetSignature(candidate, sig).catch(() => ({ ok: false }));
        if (res && res.ok) verifiedSignatures++;
      }
    }
  } catch (err) {
    /* non-fatal */
  }

  const classification = normalized?.slsaClassification || { status: "insufficient_data", levelEstimate: null, confidence: 0, reasoning: [] };
  if (verifiedSignatures > 0) {
    classification.releaseSignaturesVerified = true;
    classification.releaseSignaturesVerifiedCount = verifiedSignatures;
    classification.reasoning = classification.reasoning || [];
    classification.reasoning.push(`${verifiedSignatures} release asset(s) verified via signature.`);
    classification.confidence = Math.max(classification.confidence || 0, 90);
  }

  return { normalized, classification };
}

export default { classifyGitHubRepoSlsa };

export function mapClassificationToSlsaLevel(classification = {}) {
  // Conservative mapping rules to definitive SLSA levels (0..3)
  const status = classification.status || 'insufficient_data';
  const wfCount = Number(classification.workflowCount || 0);
  const sbomCount = Number(classification.sbomArtifactCount || 0);
  const releaseCount = Array.isArray(classification.releaseAssets) ? classification.releaseAssets.length : 0;
  const hasAttestation = Boolean(classification.workflowFiles && classification.workflowFiles.some((f) => f.hasAttestation));
  const hasSigstore = Boolean(classification.workflowFiles && classification.workflowFiles.some((f) => f.hasSigstoreKeywords));
  const hasSlsaKeywords = Boolean(classification.workflowFiles && classification.workflowFiles.some((f) => f.hasSlsaKeywords));
  const hasSbomKeywords = Boolean(classification.workflowFiles && classification.workflowFiles.some((f) => f.hasSbomKeyword));
  const hasBuildStep = Boolean(classification.workflowFiles && classification.workflowFiles.some((f) => f.hasBuildStep));
  const hasCheckout = Boolean(classification.workflowFiles && classification.workflowFiles.some((f) => f.hasCheckout));

  const citations = [];
  if (wfCount > 0) citations.push({ check: 'workflows_detected', detail: `${wfCount} workflow(s) in .github/workflows` });
  if (hasCheckout) citations.push({ check: 'checkout_step', detail: 'Workflow includes actions/checkout' });
  if (hasBuildStep) citations.push({ check: 'build_step', detail: 'Workflow includes build/test steps' });
  if (hasAttestation) citations.push({ check: 'attestation_action', detail: 'Workflow includes attestation/signing actions' });
  if (hasSigstore) citations.push({ check: 'sigstore_signing', detail: 'Workflow references Sigstore/Cosign' });
  if (sbomCount > 0) citations.push({ check: 'sbom_present', detail: `${sbomCount} SBOM-like file(s) detected` });
  if (releaseCount > 0) citations.push({ check: 'release_assets', detail: `${releaseCount} release asset(s) discovered` });

  // Determine level
  let level = 0;
  let confidence = Number(classification.confidence || 0) || 0;
  let derived = 'unknown';

  if (status === 'insufficient_data' || wfCount === 0) {
    level = 0;
    derived = 'no_provenance_detected';
  } else {
    // Determine if workflows provide substantive evidence
    const workflowsEvidence = hasAttestation || hasSlsaKeywords || hasSigstore || hasSbomKeywords || hasBuildStep || hasCheckout;

    if (workflowsEvidence) {
      // If attestation/signing + SBOM + release assets detected, map to level 3
        if (((hasAttestation || hasSigstore) && sbomCount > 0 && releaseCount > 0) || classification.releaseSignaturesVerified) {
        level = 3;
        confidence = Math.max(confidence, 85);
        derived = 'attested_signed_sbom_and_release_assets';
      } else if (hasAttestation || hasSigstore || hasSlsaKeywords || (hasBuildStep && hasCheckout)) {
        // Strong workflow signals (attestation or SLSA keywords or explicit build+checkout)
        level = 2;
        confidence = Math.max(confidence, 60);
        derived = 'attested_or_strong_workflow_signals';
      } else {
        // Workflows present but minimal signals
        level = 1;
        confidence = Math.max(confidence, 30);
        derived = 'workflow_detected_minimal_signals';
      }
    } else {
      level = 0;
      confidence = Math.max(confidence, 10);
      derived = 'no_actionable_workflow_signals';
    }
  }

  return {
    level,
    status: status,
    confidence,
    derived,
    citations,
  };
}
