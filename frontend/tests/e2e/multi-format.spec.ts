import { expect, test, type Page } from '@playwright/test';
import {
  gotoStable,
  installBrowserStubs,
  mockReaderHappyPath,
  type ReaderFixtureFormat,
} from './helpers/fixtures';

type FoliateInspectResult = {
  isFixedLayout: boolean;
  mobiVersion: number | null;
  sectionCount: number;
  hasRenderedCanvas: boolean;
  textContent: string;
};

async function inspectFoliateView(page: Page): Promise<FoliateInspectResult> {
  return page.locator('foliate-view').evaluate((element) => {
    const view = element as HTMLElement & {
      isFixedLayout?: boolean;
      book?: {
        sections?: unknown[];
        mobi?: { headers?: { mobi?: { version?: number } } };
      };
      renderer?: { getContents(): Array<{ doc?: Document | null }> };
    };
    const contents = view.renderer?.getContents() ?? [];
    let hasRenderedCanvas = false;
    const texts: string[] = [];

    for (const item of contents) {
      const doc = item?.doc;
      if (!doc) continue;
      const canvas = doc.querySelector('canvas');
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        hasRenderedCanvas = true;
      }
      const text = doc.body?.textContent?.trim();
      if (text) texts.push(text);
    }

    return {
      isFixedLayout: Boolean(view.isFixedLayout),
      mobiVersion: view.book?.mobi?.headers?.mobi?.version ?? null,
      sectionCount: view.book?.sections?.length ?? 0,
      hasRenderedCanvas,
      textContent: texts.join('\n'),
    };
  });
}

async function readStatusBarPercentage(page: Page): Promise<number> {
  const statusTrigger = page
    .getByRole('button', { name: '展开操作栏' })
    .or(page.getByRole('button', { name: '收起顶部操作栏' }));
  await expect(statusTrigger).toBeVisible({ timeout: 15_000 });
  const text = (await statusTrigger.textContent()) ?? '';
  const match = text.match(/(\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) : Number.NaN;
}

async function waitForFormatReaderReady(page: Page, title: string) {
  await expect(page.getByText('无法打开本书', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: title })).toBeVisible({
    timeout: 45_000,
  });
  await expect(
    page
      .getByRole('button', { name: '展开操作栏' })
      .or(page.getByRole('button', { name: '收起顶部操作栏' }))
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('multi-format reader E2E', () => {
  test.describe.configure({ timeout: 90_000 });

  test.use({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });

  const formatCases: Array<{
    bookId: string;
    format: ReaderFixtureFormat;
    filename: string;
    title: string;
    author: string;
    expectFixedLayout: boolean;
    expectCanvas: boolean;
    expectMobiVersion: number | null;
    firstPageText: string;
    secondPageText: string;
  }> = [
    {
      bookId: 'book-pdf-1',
      format: 'pdf',
      filename: 'sample.pdf',
      title: 'E2E Sample PDF',
      author: 'PDF Author',
      expectFixedLayout: true,
      expectCanvas: true,
      expectMobiVersion: null,
      firstPageText: 'Hello PDF Page 1',
      secondPageText: 'Hello PDF Page 2',
    },
    {
      bookId: 'book-mobi-1',
      format: 'mobi',
      filename: 'sample.mobi',
      title: 'E2E Sample MOBI',
      author: 'MOBI Author',
      expectFixedLayout: false,
      expectCanvas: false,
      expectMobiVersion: 6,
      firstPageText: 'Hello MOBI Reader',
      secondPageText: 'Second MOBI Section',
    },
    {
      bookId: 'book-azw3-1',
      format: 'azw3',
      filename: 'sample.azw3',
      title: 'E2E Sample AZW3',
      author: 'AZW3 Author',
      expectFixedLayout: false,
      expectCanvas: false,
      expectMobiVersion: 8,
      firstPageText: 'Hello AZW3 Reader',
      secondPageText: 'Second AZW3 Section',
    },
  ];

  for (const tc of formatCases) {
    test(`opens, renders, navigates, and persists progress for ${tc.format.toUpperCase()}`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));

      await installBrowserStubs(page, { preset: 'light', authenticated: true });
      const mock = await mockReaderHappyPath(page, tc.bookId, {
        filename: tc.filename,
        title: tc.title,
        author: tc.author,
        format: tc.format,
      });

      await gotoStable(page, `/read/${tc.bookId}`);
      await expect(page).toHaveURL(new RegExp(`/read/${tc.bookId}$`));
      await waitForFormatReaderReady(page, tc.title);

      expect(mock.fileHits).toBeGreaterThan(0);

      await expect
        .poll(() => inspectFoliateView(page), { timeout: 20_000 })
        .toEqual({
          isFixedLayout: tc.expectFixedLayout,
          mobiVersion: tc.expectMobiVersion,
          sectionCount: 2,
          hasRenderedCanvas: tc.expectCanvas,
          textContent: expect.stringContaining(tc.firstPageText),
        });

      const initialPct = await readStatusBarPercentage(page);
      expect(Number.isFinite(initialPct)).toBe(true);

      // Focus main reader area and navigate to the next page/section with ArrowRight.
      await page.locator('#main-content').focus();
      await page.keyboard.press('ArrowRight');

      await expect
        .poll(() => inspectFoliateView(page), { timeout: 15_000 })
        .toEqual({
          isFixedLayout: tc.expectFixedLayout,
          mobiVersion: tc.expectMobiVersion,
          sectionCount: 2,
          hasRenderedCanvas: tc.expectCanvas,
          textContent: expect.stringContaining(tc.secondPageText),
        });

      // Status bar progress should advance after turning to page 2.
      await expect
        .poll(() => readStatusBarPercentage(page), { timeout: 10_000 })
        .toBeGreaterThan(initialPct);

      // Progress persistence request should succeed without errors.
      await expect
        .poll(
          () =>
            mock.progressSaves.some(
              (save) => save.cfi.length > 0 && save.percentage > initialPct
            ),
          { timeout: 15_000 }
        )
        .toBe(true);

      await expect(page.getByText('无法打开本书', { exact: true })).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    });
  }
});
