# Release checklist

Z Reader uses [Semantic Versioning](https://semver.org/spec/v2.0.0/). An official
release is an annotated tag named `vMAJOR.MINOR.PATCH`; the tag is the single
source of truth for the Docker image version and the GitHub Release.

## Before creating a tag

- [ ] Choose the next version: increment `MAJOR` for incompatible changes,
  `MINOR` for backward-compatible features, and `PATCH` for backward-compatible fixes.
- [ ] Move the relevant entries from `Unreleased` into a dated version section in
  [`CHANGELOG.md`](../CHANGELOG.md), including upgrade notes and known limitations.
- [ ] Update `frontend/package.json` and `frontend/package-lock.json` to the same
  version when the frontend package version changes.
- [ ] Review security alerts, dependency updates, open release blockers, and
  documentation changes.
- [ ] Run the required checks from a clean checkout:

  ```bash
  (
    cd backend
    go test ./...
    go test ./handlers ./middleware ./services ./storage -coverprofile=coverage.out
    go run ./cmd/check-coverage --profile coverage.out --baseline coverage-baseline.json
  )

  (
    cd frontend
    npm ci
    npm run lint:strict
    npm run test:coverage:check
    npm run build
    npm run test:e2e:ci
    npm run test:visual
  )
  ```

- [ ] Verify the backup/restore instructions still match the supported migration path.
- [ ] Ensure the target commit has passed every required GitHub check and an approved PR review.

## Tag and publish

Create the tag only from the reviewed `main` commit:

```bash
git checkout main
git pull --ff-only origin main
git tag -a vMAJOR.MINOR.PATCH -m "Release vMAJOR.MINOR.PATCH"
git push origin vMAJOR.MINOR.PATCH
```

The tag triggers CI and the image workflow. The image workflow validates the
SemVer tag and publishes multi-architecture image tags through `docker/metadata-action`.

## After the workflows succeed

- [ ] Create the GitHub Release for the same tag and paste the corresponding
  `CHANGELOG.md` section as release notes.
- [ ] Verify the published `linux/amd64` and `linux/arm64` image tags, SBOM, and
  provenance attestation.
- [ ] Deploy to a non-production environment and verify login, upload, reading,
  progress saving, `/healthz`, `/readyz`, and a backup restore.
- [ ] Announce upgrade steps, known limitations, and rollback guidance.
