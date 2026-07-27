import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  gotoStable,
  installBrowserStubs,
  mockAuthVerified,
  mockEmptyShelfApis,
  mockPopulatedShelfApis,
} from './helpers/fixtures';

type WebVitalsBudget = {
  login: { lcpMsMax: number; clsMax: number };
  shelf: { lcpMsMax: number; clsMax: number; inpMsMax: number };
};

type PerformanceBudget = {
  webVitals: WebVitalsBudget;
  offline: { staticShellRoutes: string[]; minHitRate: number };
};

const budget = JSON.parse(
  readFileSync(path.join(process.cwd(), 'performance-budget.json'), 'utf8')
) as PerformanceBudget;

// Dev-server LCP is noisy (Fast Refresh, unoptimized assets). Keep a
// catastrophic ceiling so CI still fails on multi-second freezes while the
// documented production budgets stay tighter in performance-budget.json.
const DEV_LCP_MULTIPLIER = 3;

type VitalSample = {
  lcpMs: number | null;
  cls: number;
};

async function installVitalObservers(page: Page) {
  await page.addInitScript(() => {
    const state = {
      lcpMs: null as number | null,
      cls: 0,
    };
    (window as unknown as { __zReaderVitals: typeof state }).__zReaderVitals = state;

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as PerformanceEntry & {
          startTime: number;
        };
        if (last) {
          state.lcpMs = last.startTime;
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<
          PerformanceEntry & { hadRecentInput?: boolean; value?: number }
        >) {
          if (!entry.hadRecentInput && typeof entry.value === 'number') {
            state.cls += entry.value;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Older engines without web-vital entry types still run the functional
      // assertions below; vitals simply stay at defaults.
    }
  });
}

async function readVitals(page: Page): Promise<VitalSample> {
  // Give late LCP candidates a beat to settle after network-idle content.
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const state = (window as unknown as { __zReaderVitals?: VitalSample })
      .__zReaderVitals;
    return {
      lcpMs: state?.lcpMs ?? null,
      cls: state?.cls ?? 0,
    };
  });
}

async function measureClickLatency(page: Page, click: () => Promise<void>) {
  const started = await page.evaluate(() => performance.now());
  await click();
  // Wait for the next animation frame after the click to approximate INP.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
  const ended = await page.evaluate(() => performance.now());
  return ended - started;
}

test.describe('frontend performance budgets', () => {
  test.describe.configure({ timeout: 90_000 });

  test.use({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });

  test('login shell stays within LCP/CLS budgets', async ({ page }) => {
    await installBrowserStubs(page, { authenticated: false });
    await installVitalObservers(page);

    await gotoStable(page, '/login');
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible({
      timeout: 15_000,
    });

    const vitals = await readVitals(page);
    const lcpMax = budget.webVitals.login.lcpMsMax * DEV_LCP_MULTIPLIER;

    console.log(
      `[perf] login LCP=${vitals.lcpMs?.toFixed(0) ?? 'n/a'}ms CLS=${vitals.cls.toFixed(4)} (budget LCP<=${lcpMax}ms CLS<=${budget.webVitals.login.clsMax})`
    );

    expect(vitals.cls).toBeLessThanOrEqual(budget.webVitals.login.clsMax);
    if (vitals.lcpMs !== null) {
      expect(vitals.lcpMs).toBeLessThanOrEqual(lcpMax);
    }
  });

  test('shelf first paint stays within LCP/CLS/INP budgets', async ({ page }) => {
    await installBrowserStubs(page, { authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await installVitalObservers(page);

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('heading', { name: '我的书库' })).toBeVisible({
      timeout: 15_000,
    });

    const vitals = await readVitals(page);
    const lcpMax = budget.webVitals.shelf.lcpMsMax * DEV_LCP_MULTIPLIER;

    // Proxy for INP: open the sort control and measure click-to-frame latency.
    const sortTrigger = page.getByRole('button', { name: '书籍排序方式' });
    let inpMs = 0;
    if (await sortTrigger.isVisible().catch(() => false)) {
      inpMs = await measureClickLatency(page, async () => {
        await sortTrigger.click();
      });
    }

    console.log(
      `[perf] shelf LCP=${vitals.lcpMs?.toFixed(0) ?? 'n/a'}ms CLS=${vitals.cls.toFixed(4)} INP≈${inpMs.toFixed(0)}ms (budget LCP<=${lcpMax}ms CLS<=${budget.webVitals.shelf.clsMax} INP<=${budget.webVitals.shelf.inpMsMax * DEV_LCP_MULTIPLIER}ms)`
    );

    expect(vitals.cls).toBeLessThanOrEqual(budget.webVitals.shelf.clsMax);
    if (vitals.lcpMs !== null) {
      expect(vitals.lcpMs).toBeLessThanOrEqual(lcpMax);
    }
    if (inpMs > 0) {
      expect(inpMs).toBeLessThanOrEqual(
        budget.webVitals.shelf.inpMsMax * DEV_LCP_MULTIPLIER
      );
    }
  });

  test('empty shelf does not regress layout stability', async ({ page }) => {
    await installBrowserStubs(page, { authenticated: true });
    await mockAuthVerified(page);
    await mockEmptyShelfApis(page);
    await installVitalObservers(page);

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('heading', { name: '我的书库' })).toBeVisible({
      timeout: 15_000,
    });

    const vitals = await readVitals(page);
    console.log(
      `[perf] empty-shelf LCP=${vitals.lcpMs?.toFixed(0) ?? 'n/a'}ms CLS=${vitals.cls.toFixed(4)}`
    );
    expect(vitals.cls).toBeLessThanOrEqual(budget.webVitals.shelf.clsMax);
  });
});
