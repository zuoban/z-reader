import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export type A11yScanOptions = {
  /** CSS selectors excluded from the scan (portals, next overlays, etc.). */
  exclude?: string[];
  /** Optional include selector when scanning a dialog/sheet only. */
  include?: string[];
  /** Disable rules that are noisy for this app surface. */
  disableRules?: string[];
};

/**
 * Fail the test when axe reports serious or critical issues.
 * Moderate/minor are logged but do not fail the CI gate (keeps noise low while
 * we still surface real blockers).
 */
export async function expectNoSeriousA11yViolations(
  page: Page,
  options: A11yScanOptions = {}
) {
  let builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .exclude('nextjs-portal')
    .exclude('[data-nextjs-toast]')
    .exclude('[data-nextjs-dialog-overlay]');

  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(selector);
  }
  for (const selector of options.include ?? []) {
    builder = builder.include(selector);
  }
  if (options.disableRules?.length) {
    builder = builder.disableRules(options.disableRules);
  }

  const results = await builder.analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );

  if (results.violations.length > serious.length) {
    const soft = results.violations
      .filter((v) => v.impact !== 'serious' && v.impact !== 'critical')
      .map((v) => `${v.id}(${v.impact ?? 'unknown'})`)
      .join(', ');
    // Keep CI signal on blockers; surface softer findings in the log.
    console.warn(`[a11y] non-blocking findings: ${soft}`);
  }

  expect(
    serious,
    formatViolations(serious)
  ).toEqual([]);
}

function formatViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']
) {
  if (violations.length === 0) return 'no serious a11y violations';
  return violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 5)
        .map((n) => `  - ${n.target.join(' ')}: ${n.failureSummary ?? ''}`)
        .join('\n');
      return `[${v.impact}] ${v.id}: ${v.help}\n${nodes}`;
    })
    .join('\n\n');
}
