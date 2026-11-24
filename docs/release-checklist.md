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
    npm run test:js-budget
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

Pushing the tag runs the full CI suite for the tagged commit. The `Publish verified image`
job calls the reusable publisher only after all required jobs in that run succeed, including
Compose validation and a container smoke test. A failed, cancelled, or skipped required job
blocks publication. Every push to `main` runs the backend and frontend base checks plus the
container smoke test before publishing. Documentation-only pushes follow the same rule so they
can publish the new tip if they supersede a pending publication.

The publisher builds `linux/amd64` and `linux/arm64` images with an SBOM and a provenance
attestation. `main` pushes publish `main` and `latest`. Stable releases publish the Git tag,
the version without `v`, the `MAJOR.MINOR` alias, and `latest`. Prereleases publish the Git tag
and the prerelease version without `v`.

### Manual publication

In **Actions → CI → Run workflow**, select `main` or a `vMAJOR.MINOR.PATCH` release tag
created from reviewed `main`, and enable `publish_image`. Optional SemVer prerelease suffixes
are supported. Build metadata (`+...`), other branches, and raw SHAs are outside the supported
publication scope. The switch defaults to off. Enabling it forces all required checks even
when `run_heavy_checks` is off.

Use a ref that contains this CI workflow. GitHub executes the workflow revision on the
selected ref, so older refs can still contain the legacy standalone publisher. Treat write
access to `main`, release tags, and their workflow definitions as part of the release trust
boundary. Keep release tags immutable.

Publication jobs share a queue and run one at a time. Before logging in to GHCR, each job checks
that the remote ref still resolves to the tested commit. If `main` advances after that check,
the active build and upload can finish before a newer successful run publishes its image.
`latest` is shared by `main` and stable releases, and stable releases also share their
minor-version alias.

## After CI and publication succeed

- [ ] Create the GitHub Release for the same tag and paste the corresponding
  `CHANGELOG.md` section as release notes.
- [ ] Verify the published `linux/amd64` and `linux/arm64` image tags, SBOM, and
  provenance attestation.
- [ ] Deploy to a non-production environment and verify login, upload, reading,
  progress saving, `/healthz`, `/readyz`, and a backup restore.
- [ ] Announce upgrade steps, known limitations, and rollback guidance.
