export interface BookPreview {
  title?: string;
  author?: string;
  cover?: Blob | null;
}

declare global {
  interface Window {
    foliateMakeBook?: (file: File | Blob | string) => Promise<{
      metadata?: unknown;
      getCover?: () => Promise<Blob | null> | Blob | null;
      destroy?: () => void;
    }>;
  }
}

function normalizeTextValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(normalizeTextValue).filter(Boolean).join(', ');
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return normalizeTextValue(record.name ?? record.title ?? record.label);
  }
  return '';
}

let foliateLoadPromise: Promise<void> | null = null;

async function ensureFoliateLoaded(): Promise<void> {
  if (globalThis.window?.foliateMakeBook) return;
  if (!foliateLoadPromise) {
    foliateLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/foliate/view.js';
      script.type = 'module';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('加载阅读器脚本失败'));
      document.head.appendChild(script);
    });
  }
  await foliateLoadPromise;
}

function getNormalizedZipPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
}

function getCanonicalEpubPath(path: string, rootPrefix: string): string {
  let normalizedPath = getNormalizedZipPath(path);
  if (rootPrefix && normalizedPath.startsWith(rootPrefix)) {
    normalizedPath = normalizedPath.slice(rootPrefix.length);
  }
  normalizedPath = getNormalizedZipPath(normalizedPath);

  if (normalizedPath.toLowerCase() === 'meta-inf/container.xml') {
    return 'META-INF/container.xml';
  }

  return normalizedPath;
}

function isEpubFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.epub') || file.type === 'application/epub+zip';
}

async function isZipFile(file: File): Promise<boolean> {
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return signature[0] === 0x50
    && signature[1] === 0x4b
    && signature[2] === 0x03
    && signature[3] === 0x04;
}

function getContainerXml(opfPath: string): string {
  const escapedOpfPath = opfPath
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${escapedOpfPath}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;

  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  crcTable = table;
  return table;
}

function getCrc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function setUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function setUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function createStoredZip(entries: Array<{ path: string; blob: Blob }>): Promise<Blob> {
  const encoder = new TextEncoder();
  const fileChunks: Uint8Array[] = [];
  const centralDirectoryChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const dataBytes = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = getCrc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    setUint32(localHeader, 0, 0x04034b50);
    setUint16(localHeader, 4, 20);
    setUint16(localHeader, 6, 0x0800);
    setUint16(localHeader, 8, 0);
    setUint16(localHeader, 10, 0);
    setUint16(localHeader, 12, 0);
    setUint32(localHeader, 14, crc);
    setUint32(localHeader, 18, dataBytes.length);
    setUint32(localHeader, 22, dataBytes.length);
    setUint16(localHeader, 26, nameBytes.length);
    localHeader.set(nameBytes, 30);

    const centralDirectoryHeader = new Uint8Array(46 + nameBytes.length);
    setUint32(centralDirectoryHeader, 0, 0x02014b50);
    setUint16(centralDirectoryHeader, 4, 20);
    setUint16(centralDirectoryHeader, 6, 20);
    setUint16(centralDirectoryHeader, 8, 0x0800);
    setUint16(centralDirectoryHeader, 10, 0);
    setUint16(centralDirectoryHeader, 12, 0);
    setUint16(centralDirectoryHeader, 14, 0);
    setUint32(centralDirectoryHeader, 16, crc);
    setUint32(centralDirectoryHeader, 20, dataBytes.length);
    setUint32(centralDirectoryHeader, 24, dataBytes.length);
    setUint16(centralDirectoryHeader, 28, nameBytes.length);
    setUint32(centralDirectoryHeader, 42, offset);
    centralDirectoryHeader.set(nameBytes, 46);

    fileChunks.push(localHeader, dataBytes);
    centralDirectoryChunks.push(centralDirectoryHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirectory = concatUint8Arrays(centralDirectoryChunks);
  const endOfCentralDirectory = new Uint8Array(22);
  setUint32(endOfCentralDirectory, 0, 0x06054b50);
  setUint16(endOfCentralDirectory, 8, entries.length);
  setUint16(endOfCentralDirectory, 10, entries.length);
  setUint32(endOfCentralDirectory, 12, centralDirectory.length);
  setUint32(endOfCentralDirectory, 16, offset);

  return new Blob([...fileChunks, centralDirectory, endOfCentralDirectory], {
    type: 'application/epub+zip',
  });
}

/**
 * Detects if an EPUB has its files nested inside a subfolder, or if its
 * container file uses casing Foliate cannot look up, then rewrites the ZIP
 * paths Foliate needs to be rooted at the standard META-INF/container.xml.
 */
async function normalizeEpubStructure(file: File): Promise<File> {
  const zipModule = await import(/* webpackIgnore: true */ '/foliate/vendor/zip.js');
  const { configure, ZipReader, BlobReader, BlobWriter, TextWriter } = zipModule;
  configure({ useWebWorkers: false });

  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = await reader.getEntries();
    const containerEntry = entries.find((entry) => {
      const normalizedPath = getNormalizedZipPath(entry.filename).toLowerCase();
      return normalizedPath === 'meta-inf/container.xml'
        || normalizedPath.endsWith('/meta-inf/container.xml');
    });
    const opfEntry = entries.find((entry) => {
      const normalizedPath = getNormalizedZipPath(entry.filename).toLowerCase();
      return !entry.directory && normalizedPath.endsWith('.opf');
    });
    const containerOpfPath = containerEntry
      ? (await containerEntry.getData(new TextWriter())).match(/full-path\s*=\s*["']([^"']+)["']/i)?.[1] ?? ''
      : '';

    if (!containerEntry && !opfEntry && !containerOpfPath) {
      return file;
    }

    const containerPath = containerEntry ? getNormalizedZipPath(containerEntry.filename) : '';
    const opfPath = opfEntry ? getNormalizedZipPath(opfEntry.filename) : '';
    const sourcePath = containerPath || opfPath;
    const metaInfIndex = sourcePath.toLowerCase().lastIndexOf('meta-inf/container.xml');
    const rootPrefix = containerPath.slice(0, metaInfIndex);
    const canonicalOpfPath = getCanonicalEpubPath(
      containerOpfPath || opfPath,
      rootPrefix
    );

    const needsRewrite = !containerEntry || containerPath !== 'META-INF/container.xml';
    if (!needsRewrite) {
      return file;
    }

    const rewrittenEntries: Array<{ path: string; blob: Blob }> = [];
    const addedPaths = new Set<string>();

    for (const entry of entries) {
      if (entry.directory) {
        continue;
      }

      const normalizedFilename = getCanonicalEpubPath(entry.filename, rootPrefix);
      if (!normalizedFilename || addedPaths.has(normalizedFilename)) {
        continue;
      }
      addedPaths.add(normalizedFilename);

      const blob = normalizedFilename === 'META-INF/container.xml'
        ? new Blob([getContainerXml(canonicalOpfPath)], { type: 'application/xml' })
        : await entry.getData(new BlobWriter());
      rewrittenEntries.push({ path: normalizedFilename, blob });
    }

    if (!addedPaths.has('META-INF/container.xml')) {
      rewrittenEntries.push({
        path: 'META-INF/container.xml',
        blob: new Blob([getContainerXml(canonicalOpfPath)], { type: 'application/xml' }),
      });
    }

    const outputBlob = await createStoredZip(rewrittenEntries);

    return new File([outputBlob], file.name, {
      type: 'application/epub+zip',
      lastModified: file.lastModified,
    });
  } finally {
    await reader.close();
  }
}

export async function extractBookPreview(file: File): Promise<BookPreview> {
  await ensureFoliateLoaded();
  const makeBook = globalThis.window?.foliateMakeBook;
  if (!makeBook) {
    throw new Error('阅读器脚本不可用');
  }

  // Try to normalize EPUB structure if needed, then load with foliate
  let bookFile: File = file;
  try {
    if (isEpubFile(file) || await isZipFile(file)) {
      bookFile = await normalizeEpubStructure(file);
    }
  } catch (err) {
    console.warn('EPUB normalization failed, using original file:', err);
    bookFile = file;
  }

  const book = await makeBook(bookFile);

  const metadata = (book?.metadata ?? {}) as Record<string, unknown>;
  const title = normalizeTextValue(metadata.title) || file.name.replace(/\.[^.]+$/, '');
  const author = normalizeTextValue(metadata.author);
  const cover = await book?.getCover?.();

  book?.destroy?.();

  return {
    title,
    author,
    cover: cover instanceof Blob ? cover : null,
  };
}
