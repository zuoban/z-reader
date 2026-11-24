import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '@/test/deferred';

const { pdf, getDocument } = vi.hoisted(() => {
  const pdf = {
    numPages: 2,
    getMetadata: vi.fn().mockResolvedValue({}),
    getOutline: vi.fn().mockResolvedValue(null),
    getPage: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  return { pdf, getDocument: vi.fn(() => ({ promise: Promise.resolve(pdf) })) };
});

vi.mock('../../../public/foliate/vendor/pdfjs/pdf.mjs', () => {
  vi.stubGlobal('pdfjsLib', {
    GlobalWorkerOptions: {},
    PDFDataRangeTransport: class {},
    getDocument,
  });
  return {};
});

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
interface PDFBook {
  sections: Array<{ load: () => Promise<{ src: string; onZoom: unknown }> }>;
  destroy: () => Promise<void>;
}

let makePDF: (file: File) => Promise<PDFBook>;
const page = { getViewport: () => ({ width: 100, height: 150 }) };

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('')));
  const pdfModule = await import('../../../public/foliate/pdf.js');
  makePDF = pdfModule.makePDF as unknown as typeof makePDF;
  vi.unstubAllGlobals();
});

beforeEach(() => {
  pdf.getPage.mockReset().mockResolvedValue(page);
  pdf.destroy.mockClear();
  createObjectURL.mockReset().mockReturnValue('blob:pdf-page');
  revokeObjectURL.mockReset();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
});

afterEach(() => vi.unstubAllGlobals());

async function openPDF() {
  const book = await makePDF(new File(['pdf'], 'doc.pdf'));
  return { book, first: book.sections[0], second: book.sections[1] };
}

describe('PDF section Blob URLs', () => {
  it('shares concurrent and repeated page loads and revokes each URL once on close', async () => {
    createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const { book, first, second } = await openPDF();
    const [page1, duplicate] = await Promise.all([first.load(), first.load()]);
    expect(page1).toEqual({ src: 'blob:first', onZoom: expect.any(Function) });
    expect(duplicate).toBe(page1);
    await expect(first.load()).resolves.toBe(page1);
    await expect(second.load()).resolves.toMatchObject({ src: 'blob:second' });
    expect(pdf.getPage.mock.calls).toEqual([[1], [2]]);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    const closing = book.destroy();
    expect(revokeObjectURL.mock.calls).toEqual([['blob:first'], ['blob:second']]);
    expect(book.destroy()).toBe(closing);
    await closing;
    expect(pdf.destroy).toHaveBeenCalledTimes(1);
    await expect(first.load()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not create a URL for a page delivered after close', async () => {
    const latePage = deferred<typeof page>();
    pdf.getPage.mockReturnValueOnce(latePage.promise);
    const { book, first } = await openPDF();
    const loading = first.load();
    await book.destroy();
    latePage.resolve(page);
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('revokes a URL when close runs before its render result can be cached', async () => {
    const { book, first } = await openPDF();
    createObjectURL.mockImplementationOnce(() => {
      queueMicrotask(() => { void book.destroy(); });
      return 'blob:late';
    });
    await expect(first.load()).rejects.toMatchObject({ name: 'AbortError' });
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:late');
  });
});
