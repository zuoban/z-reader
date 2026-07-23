# E2E & Visual Regression

## Commands

```bash
cd frontend

# All Playwright specs (functional + visual)
npm run test:e2e

# CI gate: auth + virtual grid + reader + shelf→reader + search + a11y
npm run test:e2e:ci

# Shelf search only
npm run test:e2e:search

# Accessibility (axe serious/critical only)
npm run test:e2e:a11y

# Virtual shelf grid only
npm run test:e2e:virtual

# Reader happy path only
npm run test:e2e:reader

# Visual regression (uses {platform}/ subfolder — linux or darwin)
npm run test:visual

# Refresh baselines for *this* OS (writes darwin/ on macOS)
npm run test:visual:update

# Refresh Linux baselines (Docker + Noto CJK; matches CI)
npm run test:visual:update:linux

# Interactive UI mode
npm run test:visual:ui
```

## Visual baselines

- Spec: `visual-regression.spec.ts`
- Snapshots: `visual-regression.spec.ts-snapshots/{platform}/`
  - **`linux/`** — CI hard gate (generated with Playwright Docker + fonts-noto-cjk)
  - **`darwin/`** — optional local macOS baselines
- Config: `playwright.config.ts` (`maxDiffPixelRatio: 0.02`, platform path template)

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

## Accessibility e2e

- Spec: `a11y.spec.ts`
- Helper: `helpers/a11y.ts` (`expectNoSeriousA11yViolations`)
- Engine: `@axe-core/playwright` (WCAG 2.0/2.1 A/AA + best-practice tags)

| Surface | State |
| --- | --- |
| Shelf | empty, populated, category filter, selection mode |
| Reader | open chrome, TOC sheet |

Gate policy: fail on **serious/critical** only; moderate/minor are logged.

## Shelf search e2e

- Spec: `shelf-search.spec.ts`
- Fixture: `mockPopulatedShelfApis` filters `/api/books/search?q=`

| Case | Assertion |
| --- | --- |
| Title search | Server search request + only matching cards |
| Author search | e.g. 刘慈欣 → 三体 |
| Clear search | Restore full shelf |
| Empty + reset | Empty state then 重置所有筛选 |

## Shelf → reader navigation e2e

- Spec: `shelf-to-reader.spec.ts`
- Reuses `mockReaderHappyPath` + `fixtures/sample.epub`

| Case | Assertion |
| --- | --- |
| Card → open → back | Shelf click opens `/read/:id`, EPUB loads, back returns to shelf |
| Correct book id | Shelf card for `book-42` navigates to `/read/book-42` |

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
2. Prefer **Linux** baselines for CI: `npm run test:visual:update:linux` (Docker required).
3. Optionally refresh local macOS: `npm run test:visual:update` → `darwin/`.
4. Review PNG diffs under `...-snapshots/linux/` (and darwin if used).
5. Commit updated baselines with the UI change.

## CI notes

GitHub Actions (`.github/workflows/ci.yml`):

| Job | Specs | When |
| --- | --- | --- |
| Frontend Unit Test | Vitest | every push/PR |
| Frontend E2E (functional) | auth + virtual grid + reader + shelf→reader + search + a11y | every push/PR |
| Frontend Visual Regression | `visual-regression.spec.ts` vs **`linux/`** + Noto CJK | every push/PR |

Tips:

- Install `fonts-noto-cjk` on the runner (done in CI) so Chinese text matches Docker updates.
- Manual dispatch option `update_visual_snapshots` regenerates and uploads `linux/` as an artifact.
- On failure, CI uploads `playwright-report` / `test-results` (7 days).
- Playwright browsers are cached via `~/.cache/ms-playwright`.
