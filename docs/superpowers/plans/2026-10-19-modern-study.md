# Modern Study Implementation Plan

**Goal:** Apply the user-selected modern study direction across the existing frontend.

**Architecture:** Keep the ordered global CSS import graph and existing application state.
Share surface/control utilities and a decorative library preview; use page-specific utility
classes for entry layouts. Keep reader content palettes and virtual grid geometry intact.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, existing local fonts, Playwright, Vitest.

## Tasks

- [x] Update light/dark tokens and shared surfaces in `frontend/src/app/styles/`.
- [x] Simplify `AppShell.tsx`, brand colors, button/link styling and toast surfaces.
- [x] Add `LibraryPreview.tsx` and entry-page styles; rebuild the landing composition.
- [x] Restyle login/register with a responsive editorial panel and shared form fields.
- [x] Add the shelf title/count, consolidate toolbar styles, and refine fallback covers.
- [x] Refine reader controls while preserving content colors and all existing actions.
- [x] Run lint, unit tests, coverage check, build and core end-to-end suites.
- [x] Review screenshots, refresh applicable visual baselines, rerun visual verification.
- [x] Inspect the diff and record final verification and any environment limitations.

## Verification commands

Run from `frontend/`, with the repository-required `rtk` command prefix:

```sh
rtk npm run lint:strict
rtk npm run test:unit
rtk npm run test:coverage:check
rtk npm run build
rtk npm run test:e2e:ci -- --workers=2
rtk npm run test:visual
```

Review desktop light/dark landing, login and shelf images, mobile shelf selection,
tablet reader toolbar and mobile settings. Keep snapshot changes tied to the selected style.

## Verification result — 2026-10-19

- Strict ESLint and production build passed.
- 191 unit tests passed; committed coverage thresholds passed.
- Core Playwright suite: 43 passed. The reader happy-path suite was rerun after the
  final theme-color cleanup and all 3 tests passed.
- macOS visual suite: 23 passed after snapshot refresh, followed by a comparison run
  without updating snapshots. Added mobile landing, login and registration coverage.
- Independent review identified toolbar/content inset mismatch, long cover-title
  overlap and app/reader browser-color mismatch; all were addressed and checked.
- `git diff --check` passed.

### Linux platform verification

- [x] Regenerate all 23 Linux visual baselines.
- [x] Compare all 23 Linux scenarios with snapshot updates disabled: 23 passed.
- [x] Inspect desktop dark landing, desktop login and mobile shelf screenshots.
- [x] Verify Linux and macOS baseline sets both contain the same 23 PNG filenames.

Environment: Ubuntu 22.04 arm64, Playwright 1.59.1, Chromium headless shell revision
1217 (147.0.7727.0), Noto CJK and Noto Color Emoji fonts. The Linux browser exercised
this checkout's verified production build. A temporary config reused the repository's
visual tests, screenshot options and platform-scoped snapshot template, pointing at
the host production server and disabling the separate dev-server launcher.

Generation used `--update-snapshots=all`; the comparison run used
`--update-snapshots=none`. Both completed with 23 passed. The temporary runtime and
config stayed outside the repository. The standard project regeneration command is
`rtk npm run test:visual:update:linux` from `frontend/`.

The final pre-commit checks also passed: strict ESLint, 191 unit tests, coverage
baseline and production build.

### Release CI baseline alignment

The Ubuntu 24.04 amd64 PR runner passed 19 visual cases but consistently differed
in four login/register captures from the Ubuntu 22.04 arm64 production captures.
All three attempts were byte-identical: desktop full-page heights differed by 1px,
and mobile registration differed in font rendering and rounding. The actual CI
screenshots were visually reviewed before replacing only those four Linux files.
The visual runner and Docker generator now both target Ubuntu 24.04 amd64; the
existing 2% pixel threshold is unchanged. Source artifact: PR #75, CI run
39271655417, `playwright-visual-report` (artifact 12195453110).
