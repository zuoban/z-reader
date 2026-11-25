import { afterEach, describe, expect, it, vi } from "vitest";

import type { Bookmark } from "@/lib/api";
import {
  buildBookmarksMarkdownFilename,
  downloadMarkdownFile,
  formatBookmarksAsMarkdown,
} from "@/lib/bookmarks-export";

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "bm-1",
    book_id: "book-1",
    user_id: "user-1",
    cfi: "epubcfi(/6/4!/4/2)",
    percentage: 25.5,
    chapter: "第一章 启程",
    note: "这是一段精彩摘录",
    created_at: "2026-05-01T10:30:00.000Z",
    ...overrides,
  };
}

describe("formatBookmarksAsMarkdown", () => {
  it("formats book metadata and bookmarks chronologically with clean markdown", () => {
    const exportedAt = new Date(2026, 4, 20, 9, 5);
    const later = makeBookmark({
      id: "bm-2",
      chapter: "第三章 终局",
      percentage: 88.25,
      note: "第二条笔记\n第二行内容",
      created_at: new Date(2026, 4, 10, 14, 20).toISOString(),
    });
    const earlier = makeBookmark({
      id: "bm-1",
      chapter: "第一章 启程",
      percentage: 12.3,
      note: "第一条摘录",
      created_at: new Date(2026, 4, 8, 8, 4).toISOString(),
    });

    const md = formatBookmarksAsMarkdown(
      { title: "三体", author: "刘慈欣" },
      [later, earlier],
      exportedAt,
    );

    expect(md).toContain("# 三体\n\n> 作者：刘慈欣\n> 导出时间：2026-05-20 09:05 · 共 2 条书签");
    expect(md.indexOf("## 1. 第一章 启程")).toBeGreaterThan(-1);
    expect(md.indexOf("## 2. 第三章 终局")).toBeGreaterThan(
      md.indexOf("## 1. 第一章 启程"),
    );
    expect(md).toContain("- **进度**：12.3% · **时间**：2026-05-08 08:04");
    expect(md).toContain("> 第一条摘录");
    expect(md).toContain("- **进度**：88.3% · **时间**：2026-05-10 14:20");
    expect(md).toContain("> 第二条笔记\n> 第二行内容");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("omits author when absent and handles empty bookmarks", () => {
    const exportedAt = new Date(2026, 0, 2, 3, 4);
    const md = formatBookmarksAsMarkdown(
      { title: "无名书", author: null },
      [],
      exportedAt,
    );

    expect(md).toContain("# 无名书");
    expect(md).not.toContain("作者：");
    expect(md).toContain("> 导出时间：2026-01-02 03:04 · 共 0 条书签");
    expect(md).toContain("暂无书签。");
  });

  it("handles markdown-breaking newlines, missing chapter/note, and invalid dates safely", () => {
    const exportedAt = new Date(2026, 2, 15, 16, 45);
    const md = formatBookmarksAsMarkdown(
      { title: "第一行书名\r\n第二行书名", author: "作者甲\n作者乙" },
      [
        makeBookmark({
          id: "bm-1",
          chapter: "章节\n换行\t标题",
          percentage: 150,
          note: "第一段\r\n\r\n第二段  ",
          created_at: "not-a-date",
        }),
        makeBookmark({
          id: "bm-2",
          chapter: "",
          percentage: -5,
          note: "",
          created_at: "also-invalid",
        }),
      ],
      exportedAt,
    );

    expect(md).toContain("# 第一行书名 第二行书名");
    expect(md).toContain("> 作者：作者甲 作者乙");
    expect(md).toContain("## 1. 章节 换行 标题");
    expect(md).toContain("- **进度**：100.0%\n\n> 第一段\n>\n> 第二段");
    expect(md).toContain("## 2. 未识别章节");
    expect(md).toContain("- **进度**：0.0%");
    expect(md).not.toContain("**时间**");
  });
});

describe("buildBookmarksMarkdownFilename", () => {
  it("builds a sanitized filename with -书签.md suffix", () => {
    expect(buildBookmarksMarkdownFilename("红楼梦")).toBe("红楼梦-书签.md");
    expect(buildBookmarksMarkdownFilename('A/B:C*D?"E<F>G|H')).toBe(
      "A-B-C-D-E-F-G-H-书签.md",
    );
    expect(buildBookmarksMarkdownFilename("  书名  \n  副标题  ")).toBe(
      "书名 副标题-书签.md",
    );
  });

  it("falls back to bookmarks.md when title has no usable characters", () => {
    expect(buildBookmarksMarkdownFilename("")).toBe("bookmarks.md");
    expect(buildBookmarksMarkdownFilename("   ")).toBe("bookmarks.md");
    expect(buildBookmarksMarkdownFilename("///:**?...")).toBe("bookmarks.md");
  });

  it("truncates overly long book titles cleanly", () => {
    const longTitle = "书".repeat(120);
    const filename = buildBookmarksMarkdownFilename(longTitle);
    expect(filename.endsWith("-书签.md")).toBe(true);
    expect(filename.length).toBeLessThanOrEqual(80 + "-书签.md".length);
  });
});

describe("downloadMarkdownFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a markdown blob, clicks a temporary anchor, and revokes the object URL", () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:bookmarks-md");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe("三体-书签.md");
        expect(this.href).toBe("blob:bookmarks-md");
        expect(document.body.contains(this)).toBe(true);
      });

    downloadMarkdownFile("三体-书签.md", "# 三体\n");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe("text/markdown;charset=utf-8");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:bookmarks-md");
    expect(document.body.querySelector('a[download="三体-书签.md"]')).toBeNull();
  });
});
