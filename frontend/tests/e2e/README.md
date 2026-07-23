# E2E & Visual Regression

## Commands

```bash
cd frontend

# All Playwright specs (functional + visual)
npm run test:e2e

# CI gate: auth + virtual grid + reader happy path (no screenshots)
npm run test:e2e:ci

# Virtual shelf grid only
npm run test:e2e:virtual

# Reader happy path only
npm run test:e2e:reader

# Visual regression (screenshot baselines)
npm run test:visual

# Refresh baselines after intentional UI changes
npm run test:visual:update

# Interactive UI mode
npm run test:visual:ui
```

## Visual baselines

- Spec: `visual-regression.spec.ts`
- Snapshots: `visual-regression.spec.ts-snapshots/`
- Config: `playwright.config.ts` (`maxDiffPixelRatio: 0.02`, animations disabled)

Covered surfaces:

| Snapshot | Surface |
| --- | --- |
| `landing-light` / `landing-dark` | Marketing landing |
| `login-light` / `login-dark` | Login |
| `login-register-light` | Register mode |
| `shelf-empty-light` / `shelf-empty-dark` | Empty library |
| `shelf-populated-light` / `shelf-populated-dark` | Library with mock books |
| `shelf-error-light` | Load failure state |
| `shelf-populated-mobile-light` | Mobile shelf (390×844) |
| `shelf-selection-light` | Batch selection bar |
| `shelf-filter-classical-light` | Category filter applied |
| `reader-error-light` / `reader-error-dark` | Reader open failure |
| `reader-auth-loading-light` | Reader auth loading chrome |

API calls are mocked in `helpers/fixtures.ts` so runs do not need a live backend.

## Reader happy-path e2e

- Spec: `reader-happy-path.spec.ts`
- Fixture EPUB: `fixtures/sample.epub` (minimal 2-chapter package)
- API mock: `mockReaderHappyPath` in `helpers/fixtures.ts`

| Case | Assertion |
| --- | --- |
| Open book | File download + toolbar title from EPUB metadata |
| Chrome / TOC | Status bar → toolbar → TOC labels |
| Back | Returns to `/shelf` |
| Page + TOC jump | Keyboard next + chapter navigation |
| Progress | At least one progress save while paging |

## Virtual grid functional e2e

- Spec: `shelf-virtual-grid.spec.ts`
- Fixture: `mockPaginatedShelfApis` / `makeMockBooks` in `helpers/fixtures.ts`

Covers:

| Case | Assertion |
| --- | --- |
| Short-page auto load | Multiple list requests without scrolling |
| Scroll load-more | Cursor page 2+ after scrolling to end |
| Virtualization | Mounted rows/cards ≪ catalog size |
| Category filter | Grid stays interactive; non-matching books gone |
| Manual load-more | Footer button fetches next cursor page |

Reader **opened book** content is not snapshotted yet (depends on real EPUB bytes +
foliate). Prefer error/loading chrome for stable baselines.

## Updating snapshots

1. Make the intentional UI change.
2. Run `npm run test:visual:update` on the same OS you use for review (or Linux if CI visual is enabled).
3. Review PNG diffs in the snapshots folder / Playwright report.
4. Commit updated baselines with the UI change.

## CI notes

GitHub Actions (`.github/workflows/ci.yml`):

| Job | Specs | When |
| --- | --- | --- |
| Frontend Unit Test | Vitest | every push/PR |
| Frontend E2E (functional) | `auth-shelf` + `shelf-virtual-grid` + `reader-happy-path` (`npm run test:e2e:ci`) | every push/PR |
| Frontend Visual Regression | `visual-regression.spec.ts` | manual `workflow_dispatch` + `run_visual` |

Why visual is optional by default:

- Screenshot pixels differ across macOS vs Ubuntu fonts and antialiasing.
- Baselines in-repo were captured on developer machines; promoting them to a
  hard CI gate requires regenerating on `ubuntu-latest` and committing those PNGs.

Tips:

- Use `PLAYWRIGHT_EXECUTABLE_PATH` only when pinning a custom Chromium.
- On failure, CI uploads `playwright-report` / `test-results` artifacts (7 days).
- Playwright browsers are cached via `~/.cache/ms-playwright`.
