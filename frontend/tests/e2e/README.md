# E2E & Visual Regression

## Commands

```bash
cd frontend

# Functional e2e (auth / shelf / virtual grid)
npm run test:e2e

# Virtual shelf grid only
npx playwright test tests/e2e/shelf-virtual-grid.spec.ts

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
2. Run `npm run test:visual:update`.
3. Review PNG diffs in the snapshots folder / Playwright report.
4. Commit updated baselines with the UI change.

## CI notes

- Use a fixed Chromium binary when possible (`PLAYWRIGHT_EXECUTABLE_PATH`).
- Prefer Linux CI agents for reproducible font rasterization.
- On first CI setup, generate baselines on the same OS you use in CI.
