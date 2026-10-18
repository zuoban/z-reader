import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const budgets = JSON.parse(readFileSync('performance-budget.json', 'utf8')).production;
const sessions = new Map<Page, CDPSession>();

test.afterEach(async ({ page }) => {
  const cdp = sessions.get(page);
  if (!cdp) return;
  // Restore bandwidth before Playwright collects failure traces and closes the page.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  sessions.delete(page);
});

type Measurements = {
  lcp: number; cls: number; longestTask: number; firstAudio: number;
  interaction: number;
  workers: string[];
};
async function observe(page: Page) {
  await page.addInitScript(() => {
    const metrics: Measurements = { lcp: 0, cls: 0, longestTask: 0,
      firstAudio: 0, interaction: 0, workers: [] };
    Object.assign(window, { perfMetrics: metrics });
    for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask']) {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
          if (type === 'largest-contentful-paint') metrics.lcp = entry.startTime;
          if (type === 'longtask') metrics.longestTask = Math.max(metrics.longestTask, entry.duration);
          if (type === 'layout-shift' && !shift.hadRecentInput) metrics.cls += shift.value;
        }
      }).observe({ type, buffered: true });
    }
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if ((entry as PerformanceEventTiming & { interactionId?: number }).interactionId) {
          metrics.interaction = Math.max(metrics.interaction, entry.duration);
        }
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        metrics.workers.push(String(url));
        super(url, options);
      }
    };
    const NativeAudio = window.Audio;
    window.Audio = function () {
      const audio = new NativeAudio();
      audio.addEventListener('playing', () => {
        if (!metrics.firstAudio) metrics.firstAudio = performance.now();
      });
      return audio;
    } as unknown as typeof Audio;
  });
}
async function metrics(page: Page) {
  return page.evaluate(() => (window as unknown as { perfMetrics: Measurements }).perfMetrics);
}
function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// Stored padding makes transfer size reproducible; compressed chapters exercise ZIP workers.
function largeEpub() {
  const files: Array<[string, string | Buffer, boolean?]> = [
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>', true],
    ['book.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">perf-reader</dc:identifier><dc:title>Performance Reader</dc:title><dc:language>zh-CN</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>', true],
    ['chapter.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>性能章节</title></head><body><h1>首章正文已就绪</h1><p>这是一段用于生产性能验证的真实书籍正文。阅读器应当快速呈现这一段文字。</p></body></html>', true],
    ['padding.bin', Buffer.alloc(4 * 1024 * 1024, 97)],
  ];
  const locals: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [name, input, compress] of files) {
    const data = Buffer.isBuffer(input) ? input : Buffer.from(input);
    const bytes = compress ? deflateRawSync(data) : data;
    const filename = Buffer.from(name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(compress ? 8 : 0, 8); header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    locals.push(header, filename, bytes);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4);
    header.copy(central, 6, 4, 30); central.writeUInt32LE(offset, 42);
    directory.push(central, filename);
    offset += header.length + filename.length + bytes.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.reduce((sum, part) => sum + part.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...directory, end]);
}
function wave() {
  const data = Buffer.alloc(44 + 48000);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(24000, 24); data.writeUInt32LE(48000, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(48000, 40);
  return data;
}

test('production mobile login has bounded font transfers and long tasks', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  sessions.set(page, cdp);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 40, downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await observe(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(async () => (await metrics(page)).lcp).toBeGreaterThan(0);
  const measured = await metrics(page);
  const fontBytes = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => /\.woff2?(\?|$)/.test(entry.name))
    .reduce((sum, entry) => sum + (entry as PerformanceResourceTiming).decodedBodySize, 0));
  console.log('[production mobile]', { ...measured, fontBytes });
  expect(measured.lcp).toBeGreaterThan(0);
  expect(measured.lcp).toBeLessThan(budgets.mobileLoginLcpMs);
  expect(measured.cls).toBeLessThanOrEqual(0.1);
  expect(measured.longestTask).toBeLessThan(budgets.mobileLongestTaskMs);
  expect(fontBytes).toBeGreaterThan(0);
  expect(fontBytes).toBeLessThan(budgets.loginFontBytes);
});

test('real backend shelf, large EPUB worker, offline reuse and first audio', async ({ page, context }) => {
  const username = `perf-${Date.now()}`;
  const register = await context.request.post('/api/register', {
    data: { username, password: 'Production-perf-12345' },
  });
  expect(register.ok()).toBeTruthy();
  const login = await context.request.post('/api/login', {
    data: { username, password: 'Production-perf-12345' },
  });
  expect(login.ok()).toBeTruthy();
  const upload = await context.request.post('/api/books', {
    multipart: { file: { name: 'performance.epub', mimeType: 'application/epub+zip', buffer: largeEpub() } },
  });
  expect(upload.ok()).toBeTruthy();
  const book = await upload.json();
  const bookID = book.id ?? book.book?.id;
  expect(bookID).toBeTruthy();
  await expect.poll(async () => {
    const response = await context.request.get(`/api/books/${bookID}`);
    return (await response.json()).processing_state;
  }).not.toBe('pending');
  await observe(page);
  const shelfStarted = Date.now();
  await page.goto('/shelf');
  await expect(page.getByText('Performance Reader', { exact: true }).first()).toBeVisible();
  const shelfMs = Date.now() - shelfStarted;
  expect(shelfMs).toBeLessThan(budgets.shelfContentMs);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(async () => (await metrics(page)).lcp).toBeGreaterThan(0);
  await page.getByRole('button', { name: '书籍排序方式' }).click();
  await page.keyboard.press('Escape');
  const shelf = await metrics(page);
  expect(shelf.lcp).toBeLessThan(budgets.shelfContentMs);
  expect(shelf.cls).toBeLessThanOrEqual(0.15);
  expect(shelf.interaction).toBeLessThanOrEqual(budgets.shelfInteractionMs);
  const cdp = await context.newCDPSession(page);
  sessions.set(page, cdp);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 40, downloadThroughput: 8_000_000 / 8,
    uploadThroughput: 750_000 / 8,
  });
  let fileRequests = 0;
  page.on('request', request => { if (request.url().includes(`/api/books/${bookID}/file`)) fileRequests++; });
  const readerStarted = Date.now();
  await page.goto(`/read/${bookID}`);
  await page.waitForFunction(() => {
    const view = document.querySelector('foliate-view') as HTMLElement & {
      renderer?: { getContents: () => Array<{ doc: Document }> };
    };
    return view?.renderer?.getContents().some(item =>
      item.doc?.body?.textContent?.includes('首章正文已就绪'));
  });
  const readerMs = Date.now() - readerStarted;
  const initial = await metrics(page);
  expect(readerMs).toBeLessThan(budgets.largeReaderContentMs);
  expect(initial.workers.some(url => url.includes('/zip-worker.js'))).toBeTruthy();
  expect(initial.longestTask).toBeLessThan(budgets.readerLongestTaskMs);
  expect(fileRequests).toBe(1);
  const expandBeforeSave = page.getByRole('button', { name: '展开操作栏' });
  if (await expandBeforeSave.isVisible()) await expandBeforeSave.click();
  await page.getByTitle('保存到此设备，退出登录后会自动清除').click();
  await expect(page.getByText('图书已保存到此设备，可在断网时继续阅读')).toBeVisible();
  expect(fileRequests).toBe(2);
  await page.reload();
  await page.waitForFunction(() => {
    const view = document.querySelector('foliate-view') as HTMLElement & {
      renderer?: { getContents: () => Array<{ doc: Document }> };
    };
    return view?.renderer?.getContents().some(item =>
      item.doc?.body?.textContent?.includes('首章正文已就绪'));
  });
  await expect(page.getByRole('heading', { name: 'Performance Reader' })).toBeVisible();
  expect(fileRequests).toBe(2);
  // Only the external speech provider is deterministic; auth, upload, file and metadata use Go.
  await page.route('**/api/voices', route => route.fulfill({ json: [] }));
  await page.route('**/api/ssml', route => route.fulfill({ contentType: 'audio/wav', body: wave() }));
  const expand = page.getByRole('button', { name: '展开操作栏' });
  if (await expand.isVisible()) await expand.click();
  const audioStarted = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: '朗读控制', exact: true }).first().click();
  await page.getByTitle('开始', { exact: true }).click();
  await expect.poll(async () => (await metrics(page)).firstAudio).toBeGreaterThan(0);
  const audioMs = (await metrics(page)).firstAudio - audioStarted;
  console.log('[production reader]', { shelfMs, shelfLcpMs: shelf.lcp, shelfCls: shelf.cls,
    shelfInteractionMs: shelf.interaction, readerMs, audioMs,
    longestTaskMs: initial.longestTask, fileRequests, bytes: largeEpub().length });
  expect(audioMs).toBeLessThan(budgets.firstAudioMs);
});
