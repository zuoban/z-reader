#!/usr/bin/env bash
# Generate / refresh visual baselines on Linux (Playwright Docker image).
# Use this so committed screenshots match GitHub Actions ubuntu-latest.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAYWRIGHT_VERSION="$(node -p "require('${ROOT}/node_modules/@playwright/test/package.json').version")"
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy"

echo "Using image: ${IMAGE}"
echo "Working dir: ${ROOT}"

docker run --rm \
  -v "${ROOT}:/work" \
  -w /work \
  -e CI=true \
  -e HOME=/tmp \
  "${IMAGE}" \
  bash -lc '
    set -euo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq fonts-noto-cjk fonts-noto-color-emoji >/dev/null
    # Prefer a clean install when package-lock is present.
    if [ -f package-lock.json ]; then
      npm ci
    else
      npm install
    fi
    npx playwright test tests/e2e/visual-regression.spec.ts --update-snapshots --workers=1
  '

echo "Linux snapshots updated under tests/e2e/visual-regression.spec.ts-snapshots/linux/"
