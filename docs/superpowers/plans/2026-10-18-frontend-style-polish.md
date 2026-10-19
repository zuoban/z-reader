# Frontend style polish implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent
> font/settings and CSS tasks, with integration and review in the current session.

**Goal:** Complete all seven frontend style improvements approved from the audit.

**Architecture:** Keep existing React state, API calls and virtual grid. Adapt the
responsive composition, share font-face rules with reader documents, and separate
CSS responsibilities while retaining the existing paper theme.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Base UI, Foliate, Vitest, Playwright.

## Tasks

- [x] Add responsive browser regressions for mobile batch count/action layout and
  640/768px reader back/title visibility. Run them against the existing UI to establish
  the failures before changing layout.
- [x] Refactor shelf controls and batch action bar in `frontend/src/app/shelf/page.tsx`.
  Place search/sort together, keep management outside category scrolling, and make
  the mobile batch bar two rows with a visible exit action.
- [x] In `ReaderToolbar.tsx`, use compact actions below 1024px and update its existing
  component assertion. Ensure reader sheets still mount and work from overflow.
- [x] Simplify `BookCard.tsx`: compact cover proportions/metadata, remove duplicate
  fallback author, and make the read footer an actual button. Update grid height
  estimates/skeletons together and verify card reading/selection/search.
- [x] Implement and test shared reader font rules and compact truthful/collapsible
  preview in font/settings files. Verify actual EPUB document font faces and font
  selection after chapter navigation.
- [x] Clean/split `globals.css` with explicit imports, remove confirmed-unused legacy
  classes/duplicate rules and redundant important overrides, and unify surface tokens.
- [x] Review requirements and code quality; fix any issues. Run strict lint, unit,
  coverage, build and core Playwright tests. Review and update macOS/Linux visual
  baselines using repository scripts, then rerun visual verification.
- [x] Perform final browser verification at 320/375/390/640/768/1280px, including
  dark mode, keyboard actions and reduced motion. Record results and remaining limits.

## Commands

All shell commands use the required `rtk` prefix. From `frontend`:

```sh
rtk npm run lint:strict
rtk npm run test:unit
rtk npm run test:coverage:check
rtk npm run build
rtk npm run test:e2e:ci
rtk npm run test:visual
```

Expected: zero lint warnings; passing tests/coverage/build and reviewed visual snapshots.

## Verification record — 2026-10-19

| Check | Result |
| --- | --- |
| Strict ESLint | Passed, zero warnings |
| Vitest unit suite | 185 tests passed in 29 files |
| Coverage baseline gate | Passed; overall line coverage 77.93% |
| Production build | Passed with Next.js 16.4.2 and TypeScript checks |
| macOS core Playwright suite | 42 passed against the production build |
| macOS visual comparison | 20 passed |
| Linux core Playwright suite | 42 passed |
| Linux visual comparison | 20 passed against reviewed platform baselines |
| Landscape keyboard regression | Passed three consecutive Linux runs and manual Tabbit verification |
| Diff whitespace validation | Passed |

Linux verification used an isolated Ubuntu 22.04 ARM64 container with Node 22,
Playwright's matching Chromium revision 1217 and CJK fonts. Browser suites use
mocked APIs and the real in-repository EPUB fixture; they do not require a live backend.

Responsive checks cover 320/375/390px shelves, 640/768/1023px compact reader
toolbars and desktop layouts. Final manual verification also covers the dark
812×375 landscape settings sheet, reduced motion, preview collapse/expand,
keyboard menu activation, Escape focus return and reopening settings.

The final keyboard regression caught two related menu issues: transitioning
`visibility` prevented the opening focus call, and Escape propagated into the
reader's global back shortcut. The menu now switches visibility immediately,
retains opacity/transform animation and consumes its own Escape event.

All seven approved requirements passed spec and code-quality review. Changes are
left uncommitted on `codex/frontend-style-polish` for review.
