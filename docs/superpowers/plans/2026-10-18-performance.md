# Z Reader performance implementation plan

**Goal:** Complete the performance improvements identified in the project audit, retaining
authentication, download recovery, book formats, typography, and progress consistency.

**Architecture:** Keep the existing Next.js/Go/bbolt deployment. Optimize critical paths and
maintain durable indexes rather than introduce another service. Independent backend, download,
and reader asset work runs in parallel; shelf integration and final validation run centrally.

**Tech stack:** Next.js 16, React 19, Go, bbolt, Vitest, Playwright.

## Requirements and verification

- [x] Fonts: locally hosted Unicode subsets, arbitrary Chinese glyph coverage, current font weights;
  compare emitted font assets and browser font requests, verify visual regression.
- [x] Shelf: show books independently of progress/summary; cancel obsolete searches and ignore late
  results; batch processing-state polls. Deferred-promise hook tests prove the critical path.
- [x] Categories: server filtering before cursor pagination, including uncategorized and search;
  mutation/migration/auth isolation tests and E2E finding a book outside the unfiltered first page.
- [x] Downloads: bounded overlap of network and persistent writes, reusable writer metadata,
  reduced copies, Range recovery, authenticated hash-validated offline reuse, cancellation and
  deduplicated requests. Stream/cache tests cover failure, retry, and shared consumers.
- [x] Uploads: indexed missing hashes and recoverable background backfill; normal hash misses
  never deserialize the full library. Cover legacy duplicates and backfill restart in Go tests.
- [x] Reader: actual ZIP Worker support with compatibility fallback, critical module preload,
  lazy dialogs/settings/TTS interfaces and voice fetch. Check EPUB/TTS E2E and resource requests.
- [x] Storage: broad/single-rune/cursor searches avoid sorting all matches; selective queries keep
  their advantage. Progress writes update only indexes whose keys changed. Run correctness,
  concurrency tests, and 1k/10k microbenchmarks for selective and broad queries.
- [x] Performance gates: production-mode browser tests, CPU/network constrained mobile scenario,
  reader time-to-content, long tasks, large-book loading, and TTS first audio; strict budgets and
  updated reproducible measurements in docs/performance-baseline.md.

## Execution order

1. Add regression tests that reproduce a delayed progress/summary blocking shelf rendering.
   `rtk npm run test:unit -- src/hooks/__tests__/useShelfData.test.ts` must fail first, then pass.
2. Implement shelf first-paint independence and refresh generations. Extend pagination/search
   options with `category` / `uncategorized`, and add batched `GET /api/books/status?book_ids=...`.
3. Backend worker adds and tests durable category/missing-hash/search-count indexes and scoped
   queries. Keep old API calls compatible. Use the existing DB migration version sequence.
4. Download worker verifies interrupted streams and delayed Cache Storage writes with deferred
   promises, implements bounded writer sessions, and tests hash-validated offline reuse.
5. Asset worker splits Chinese fonts without losing glyphs, defers optional UI, and validates the
   vendored ZIP Worker implementation before enabling it. Do not increase budgets to hide growth.
6. Add production Playwright configuration and deterministic performance scenarios. Keep mock
   functional tests and real backend storage benchmarks separately identified in reports.
7. Review all diffs and run the complete backend/frontend gates. Run relevant functional/visual
   E2E and production performance suites; investigate failures without relaxing assertions.
8. Refresh performance documentation using fresh results and audit every requirement above.

## Baseline before changes

On Apple M1 / Go 1.27.2, 10k books: first page 73,710 ns/op, summary 2,824 ns/op,
exact title search 2,115,181 ns/op, progress save 8,170,589 ns/op.
Production HTML script budget totals: home 682,956 B, login 688,837 B, shelf 943,459 B.
These script totals include nomodule scripts and are not browser transfer sizes.
Three monolithic Noto Serif SC WOFF2 assets total 4,592,840 B.

## Completion evidence (2026-10-18)

- Backend: complete Go suite, vet, formatting, core coverage baselines and relevant race tests passed.
- Frontend: strict lint; 176 unit tests with unchanged coverage floors; production build and
  existing JS ceilings; 3 native Foliate build tests; 32 functional E2E tests passed.
- Visuals: 16 macOS comparisons passed. Linux baselines remain unchanged and run in CI.
- Production: 2 isolated standalone-browser scenarios passed on final runtime code, with no
  relaxed multiplier. Mobile login LCP 2124 ms, font responses 126008 B, real 4 MiB EPUB
  body content 4662 ms, deterministic first audio 500.2 ms.
- Independent review findings were resolved with regression coverage: full-category mutation,
  stale summary replacement, late shelf progress clearing and queued-download cancellation.
- Reproducible measurements and limitations: `docs/performance-baseline.md`,
  `docs/performance/backend-2026-10-18.txt`, `docs/performance/frontend-2026-10-18.txt`.
- Progress save latency improvement was not established; allocation reductions were measured.
  Reading still opens a completed Blob; remote chapter streaming is outside this implementation.
