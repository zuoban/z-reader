import type { Bookmark } from "@/lib/api";

const MAX_FILENAME_BASE_LENGTH = 80;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) return "0.0%";
  return `${Math.max(0, Math.min(value, 100)).toFixed(1)}%`;
}

function normalizeSingleLine(value?: string | null): string {
  if (!value) return "";
  return value.replace(/\r\n?|\n/g, " ").replace(/\s+/g, " ").trim();
}

function formatBlockquote(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  return normalized
    .split("\n")
    .map((line) => {
      const trimmedEnd = line.trimEnd();
      return trimmedEnd ? `> ${trimmedEnd}` : ">";
    })
    .join("\n");
}

function sortBookmarksChronologically(bookmarks: Bookmark[]): Bookmark[] {
  return bookmarks
    .map((bookmark, index) => ({
      bookmark,
      index,
      timestamp: Date.parse(bookmark.created_at),
    }))
    .sort((left, right) => {
      const leftValid = !Number.isNaN(left.timestamp);
      const rightValid = !Number.isNaN(right.timestamp);
      if (leftValid && rightValid && left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.bookmark);
}

export function formatBookmarksAsMarkdown(
  book: { title: string; author?: string | null },
  bookmarks: Bookmark[],
  exportedAt: Date = new Date(),
): string {
  const title = normalizeSingleLine(book.title) || "未命名书籍";
  const author = normalizeSingleLine(book.author);
  const safeExportDate = Number.isNaN(exportedAt.getTime())
    ? new Date()
    : exportedAt;

  const headerLines = [`# ${title}`];
  const metaLines: string[] = [];
  if (author) {
    metaLines.push(`> 作者：${author}`);
  }
  metaLines.push(
    `> 导出时间：${formatDateTime(safeExportDate)} · 共 ${bookmarks.length} 条书签`,
  );

  const sections: string[] = [headerLines.join("\n"), metaLines.join("\n")];

  if (bookmarks.length === 0) {
    sections.push("暂无书签。");
    return `${sections.join("\n\n")}\n`;
  }

  const ordered = sortBookmarksChronologically(bookmarks);

  ordered.forEach((bookmark, index) => {
    const chapter = normalizeSingleLine(bookmark.chapter) || "未识别章节";
    const createdDate = new Date(bookmark.created_at);
    const createdPart = Number.isNaN(createdDate.getTime())
      ? ""
      : ` · **时间**：${formatDateTime(createdDate)}`;

    const entryParts = [
      `## ${index + 1}. ${chapter}`,
      `- **进度**：${formatPercentage(bookmark.percentage)}${createdPart}`,
    ];

    const formattedNote = bookmark.note ? formatBlockquote(bookmark.note) : "";
    if (formattedNote) {
      entryParts.push(formattedNote);
    }

    sections.push(entryParts.join("\n\n"));
  });

  return `${sections.join("\n\n")}\n`;
}

export function buildBookmarksMarkdownFilename(title: string): string {
  const cleaned = title
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .slice(0, MAX_FILENAME_BASE_LENGTH)
    .replace(/[\s.-]+$/g, "");

  if (!cleaned) {
    return "bookmarks.md";
  }

  return `${cleaned}-书签.md`;
}

export function downloadMarkdownFile(filename: string, content: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;

  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    globalThis.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }
}
