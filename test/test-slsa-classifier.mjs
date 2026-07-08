import assert from 'assert';
import { normalizeGitHubMetadata } from '../lib/server/engines/github.js';
import { mapClassificationToSlsaLevel } from '../lib/spr/slsa-classifier.js';

function makeRawRepo(overrides = {}) {
  const now = new Date().toISOString();
  return Object.assign(
    {
      full_name: 'octocat/Hello-World',
      html_url: 'https://github.com/octocat/Hello-World',
      pushed_at: now,
      created_at: now,
      subscribers_count: 1,
      stargazers_count: 0,
      forks_count: 0,
      open_issues_count: 0,
      size: 1,
    },
    overrides
  );
}

async function testNoWorkflowsIsInsufficient() {
  const raw = makeRawRepo();
  const normalized = normalizeGitHubMetadata(raw, { repo: 'octocat/Hello-World', workflowFiles: [], sbomArtifacts: [], releaseAssets: [] });
  assert.ok(normalized.slsaClassification, 'slsaClassification present');
  assert.strictEqual(normalized.slsaClassification.status, 'insufficient_data', 'No workflows -> insufficient_data');
  console.log('✓ testNoWorkflowsIsInsufficient');
}

async function testWorkflowWithBuildMapsToPartialLevel2() {
  const raw = makeRawRepo();
  const workflowFiles = [
    {
      name: 'build.yml',
      path: '.github/workflows/build.yml',
      hasSlsaKeywords: false,
      hasSigstoreKeywords: false,
      hasAttestation: false,
      hasBuildStep: true,
      hasCheckout: true,
      hasSbomKeyword: false,
    },
  ];
  const normalized = normalizeGitHubMetadata(raw, { repo: 'octocat/Hello-World', workflowFiles, sbomArtifacts: [], releaseAssets: [] });
  assert.ok(normalized.slsaClassification, 'slsaClassification present');
  assert.strictEqual(normalized.slsaClassification.status, 'partial', 'Workflow with build -> partial');
  assert.strictEqual(normalized.slsaClassification.levelEstimate, 2, 'Workflow build signals -> level 2 estimate');
  const mapped = mapClassificationToSlsaLevel(normalized.slsaClassification);
  assert.strictEqual(mapped.level, 2, 'Mapped level for build workflow should be 2');
  console.log('✓ testWorkflowWithBuildMapsToPartialLevel2');
}

async function testSbomWithoutWorkflowIsInsufficient() {
  const raw = makeRawRepo();
  const sbomArtifacts = [{ name: 'sbom.json', path: 'sbom.json', downloadUrl: null }];
  const normalized = normalizeGitHubMetadata(raw, { repo: 'octocat/Hello-World', workflowFiles: [], sbomArtifacts, releaseAssets: [] });
  assert.ok(normalized.slsaClassification, 'slsaClassification present');
  assert.strictEqual(normalized.slsaClassification.status, 'insufficient_data', 'SBOM without workflows -> insufficient_data');
  console.log('✓ testSbomWithoutWorkflowIsInsufficient');
}

async function testAttestedSbomAndSignedReleaseMapsToLevel3() {
  const raw = makeRawRepo();
  const workflowFiles = [
    {
      name: 'build.yml',
      path: '.github/workflows/build.yml',
      hasSlsaKeywords: false,
      hasSigstoreKeywords: true,
      hasAttestation: true,
      hasBuildStep: true,
      hasCheckout: true,
      hasSbomKeyword: true,
    },
  ];
  const sbomArtifacts = [{ name: 'sbom.json', path: 'sbom.json', downloadUrl: null }];
  const releaseAssets = [{ name: 'app.tar.gz', path: 'releases/app.tar.gz' }, { name: 'app.tar.gz.sig', path: 'releases/app.tar.gz.sig' }];
  const normalized = normalizeGitHubMetadata(raw, { repo: 'octocat/Hello-World', workflowFiles, sbomArtifacts, releaseAssets });
  assert.ok(normalized.slsaClassification, 'slsaClassification present');
  const mapped = mapClassificationToSlsaLevel(normalized.slsaClassification);
  assert.strictEqual(mapped.level, 3, 'Attested workflow + SBOM + signed release -> level 3');
  console.log('✓ testAttestedSbomAndSignedReleaseMapsToLevel3');
}

async function run() {
  await testNoWorkflowsIsInsufficient();
  await testWorkflowWithBuildMapsToPartialLevel2();
  await testSbomWithoutWorkflowIsInsufficient();
  await testAttestedSbomAndSignedReleaseMapsToLevel3();
  console.log('All SLSA classifier unit tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
