CI SLSA Signed-Fixtures Setup

Overview

This document explains how to enable the SLSA signed-fixtures verification job in the CI workflow and how to create and host signed fixtures for verification.

Required GitHub Secrets

- `SLSA_FIXTURE_URL`: URL (https) where the signed fixture binary can be downloaded by CI.
- `SLSA_FIXTURE_SIG_URL`: URL (https) where the signature file for the fixture can be downloaded by CI.
- `SLSA_FIXTURE_PUBLIC_KEY`: The cosign public key (text/PEM) used to verify the signature. Place the full public key contents in the secret value.

Behavior in CI

- If the three secrets above are not configured, the `slsa-signed-fixtures` job will skip verification and exit successfully.
- When the secrets are present, the job will:
  1. Download `cosign` binary for the runner OS.
  2. Fetch the fixture, signature, and public key.
  3. Run `cosign verify-blob --key <public_key> --signature <sig> <fixture>`.
  4. If verification passes, it proceeds to run `npm run test:slsa:fixtures` with `TEST_SLSA_MOCK=false`.

Options for hosting fixtures

1) Hosted fixtures (recommended for production):
   - Upload the signed fixture blob and signature to a durable public or internal storage (S3, GCS, or GitHub Releases) and provide URLs in the secrets above. Prefer a short-lived object URL when possible.

2) Repo-hosted fixtures (convenient for demos):
   - Commit the fixture blob, signature, and public key under `/fixtures/` in the repository (do NOT commit private keys).
   - This repo-hosted approach allows CI to verify fixtures without external hosting — see `fixtures/` and `test/test-slsa-fixtures.mjs` for an example.

Creating and signing fixtures locally (example using cosign)

1. Download `cosign` for your platform from the releases page:

   https://github.com/sigstore/cosign/releases/latest

2. Generate a key pair (keep the private key secret):

```bash
cosign generate-key-pair
# This creates `cosign.key` (private) and `cosign.pub` (public)
```

3. Sign a fixture blob:

```bash
cosign sign-blob --key cosign.key --output-signature fixture.sig fixture.bin
```

4. Verify locally:

```bash
cosign verify-blob --key cosign.pub --signature fixture.sig fixture.bin
```

CI Notes and Security

- Never commit private signing keys (`cosign.key`) to the repository or expose them as CI secrets unless strictly controlled.
- For production verification of official artifacts, prefer hosting signatures alongside release assets and use short-lived credentials or OIDC flows for signing.

Troubleshooting

- If `cosign verify-blob` fails in CI, inspect the fixture URL, signature, and public key for truncation or encoding issues. Use `echo "$SLSA_FIXTURE_PUBLIC_KEY" | sed -n '1,10p'` locally to ensure correct content.
- For Windows runners, the job downloads the `cosign` Windows binary and uses it as `cosign.exe`.

References

- sigstore/cosign: https://github.com/sigstore/cosign
