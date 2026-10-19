# Frontend style polish

The user approved the seven improvements from the frontend audit. Preserve the warm
paper palette, serif identity, light/dark themes and current reader/shelf functions.

## Requirements

1. At 320–390px, batch selection shows a complete count and reachable, untruncated
   actions. Use a full-width two-row mobile bar with a persistent exit control.
2. At 640–1023px, reader actions use the overflow menu so the back button and book
   title retain space. Full desktop actions start at 1024px.
3. Reader documents receive the same self-hosted font definitions as the settings
   preview. Chinese font choices must differ meaningfully; font URLs must resolve
   inside blob documents. The preview must show the selected 12–32px size accurately.
4. Mobile shelf search and sorting share one row. Search uses 16px on mobile. Category
   scrolling contains categories only, while management/batch actions stay discoverable.
5. Reduce book card height and repeated fallback-cover text. Keep titles/authors and
   progress readable, and make the footer read action a real button. Preserve selection,
   context menus, search highlighting, virtual grid measurement and keyboard access.
6. Make the reader preview compact and collapsible so common settings appear sooner.
   Keep preference values, tabs, reset and all advanced options available.
7. Remove unused legacy CSS and repeated declarations. Split theme/base, shared
   surfaces, shelf and reader styles into focused files; use shared radius/shadow
   tokens and remove unnecessary important overrides without visual regressions.

## Verification

Regression tests cover narrow-screen action geometry, reader title/back visibility,
font propagation and real preview size, footer reading, and preview collapse. Run
strict lint, all unit tests, coverage gate, production build, core Playwright flows,
and updated, reviewed visual baselines. Inspect mobile, tablet and desktop light/dark
screens. Linux baselines remain the CI visual gate; do not lower thresholds.
