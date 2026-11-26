import { act, fireEvent, render, screen, waitFor } from "@/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReaderSearchSheet } from "@/components/reader/ReaderSearchSheet";
import type {
  BookSearchCallbacks,
  BookSearchOutcome,
  BookSearchResultItem,
} from "@/hooks/useFoliateView";
import { PRESET_STYLES } from "@/hooks/useReaderTheme";
import { deferred } from "@/test/deferred";

function makeResult(
  overrides: Partial<BookSearchResultItem> = {},
): BookSearchResultItem {
  return {
    cfi: "epubcfi(/6/4!/4/2)",
    sectionLabel: "第一章 启程",
    excerpt: {
      pre: "清晨的微风拂过",
      match: "书页",
      post: "上的露珠。",
    },
    ...overrides,
  };
}

describe("ReaderSearchSheet", () => {
  beforeEach(() => {
    window.sessionStorage.removeItem("z-reader-book-recent-searches");
  });

  it("shows initial prompt, streams results with highlights, and jumps on click", async () => {
    const searchDeferred = deferred<BookSearchOutcome>();
    let capturedCallbacks: BookSearchCallbacks | undefined;

    const onSearch = vi.fn(
      (
        _query: string,
        callbacks?: BookSearchCallbacks,
      ): Promise<BookSearchOutcome> => {
        capturedCallbacks = callbacks;
        return searchDeferred.promise;
      },
    );
    const onSelectResult = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ReaderSearchSheet
        open
        onOpenChange={onOpenChange}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.sepia}
        onSearch={onSearch}
        onClearSearch={vi.fn()}
        onSelectResult={onSelectResult}
      />,
    );

    expect(
      screen.getByText("输入关键词在全书范围内搜索"),
    ).toBeInTheDocument();

    const searchInput = screen.getByRole("searchbox", { name: "书内全文搜索" });
    fireEvent.change(searchInput, { target: { value: "书页" } });
    fireEvent.submit(searchInput.closest("form")!);

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch.mock.calls[0][0]).toBe("书页");
    expect(screen.getByRole("progressbar", { name: "搜索进度" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();

    act(() => {
      capturedCallbacks?.onProgress?.(0.45);
      capturedCallbacks?.onResults?.([
        makeResult(),
        makeResult({
          cfi: "epubcfi(/6/6!/4/8)",
          sectionLabel: "第二章 远行",
          excerpt: { pre: "翻开泛黄的", match: "书页", post: "继续前行。" },
        }),
      ]);
    });

    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("第一章 启程")).toBeInTheDocument();
    expect(screen.getByText("第二章 远行")).toBeInTheDocument();
    const marks = screen.getAllByText("书页");
    expect(marks).toHaveLength(2);
    expect(marks[0].tagName).toBe("MARK");
    expect(marks[0]).toHaveClass("reader-search-mark");

    await act(async () => {
      searchDeferred.resolve({ total: 2, supported: true, truncated: false });
      await searchDeferred.promise;
    });

    expect(screen.getByText("找到 2 处匹配")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清除高亮" })).toBeInTheDocument();

    const firstResult = screen.getByRole("button", {
      name: /跳转到 第一章 启程：清晨的微风拂过书页上的露珠/,
    });
    fireEvent.click(firstResult);

    expect(onSelectResult).toHaveBeenCalledExactlyOnceWith("epubcfi(/6/4!/4/2)");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(firstResult).toHaveAttribute("aria-current", "true");
  });

  it("cancels in-progress search on stop button and ignores late callbacks", async () => {
    const searchDeferred = deferred<BookSearchOutcome>();
    let capturedCallbacks: BookSearchCallbacks | undefined;
    let capturedSignal: AbortSignal | undefined;

    const onSearch = vi.fn(
      (
        _query: string,
        callbacks?: BookSearchCallbacks,
        signal?: AbortSignal,
      ) => {
        capturedCallbacks = callbacks;
        capturedSignal = signal;
        return searchDeferred.promise;
      },
    );

    render(
      <ReaderSearchSheet
        open
        onOpenChange={vi.fn()}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.light}
        onSearch={onSearch}
        onClearSearch={vi.fn()}
        onSelectResult={vi.fn()}
      />,
    );

    const searchInput = screen.getByRole("searchbox", { name: "书内全文搜索" });
    fireEvent.change(searchInput, { target: { value: "星辰" } });
    fireEvent.submit(searchInput.closest("form")!);

    expect(capturedSignal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    expect(capturedSignal?.aborted).toBe(true);
    expect(screen.queryByRole("button", { name: "停止" })).not.toBeInTheDocument();

    act(() => {
      capturedCallbacks?.onResults?.([makeResult({ cfi: "late-cfi" })]);
    });
    expect(screen.queryByText("第一章 启程")).not.toBeInTheDocument();
  });

  it("aborts in-progress search on unmount and supports clear highlights", async () => {
    const pendingSearch = deferred<BookSearchOutcome>();
    let capturedSignal: AbortSignal | undefined;
    const onClearSearch = vi.fn();

    const onSearch = vi
      .fn<
        (
          query: string,
          callbacks?: BookSearchCallbacks,
          signal?: AbortSignal,
        ) => Promise<BookSearchOutcome>
      >()
      .mockImplementationOnce(async (_query, callbacks) => {
        callbacks?.onResults?.([makeResult()]);
        return { total: 1, supported: true, truncated: true };
      })
      .mockImplementationOnce((_query, _callbacks, signal) => {
        capturedSignal = signal;
        return pendingSearch.promise;
      });

    const { unmount } = render(
      <ReaderSearchSheet
        open
        onOpenChange={vi.fn()}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.dark}
        onSearch={onSearch}
        onClearSearch={onClearSearch}
        onSelectResult={vi.fn()}
      />,
    );

    const searchInput = screen.getByRole("searchbox", { name: "书内全文搜索" });
    fireEvent.change(searchInput, { target: { value: "书页" } });
    fireEvent.submit(searchInput.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("已显示前 1 处匹配")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "清除高亮" }));
    expect(onClearSearch).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("输入关键词在全书范围内搜索"),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "第二次搜索" } });
    fireEvent.submit(searchInput.closest("form")!);
    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("shows empty and unsupported states and clears query on Escape first", async () => {
    const onOpenChange = vi.fn();
    const onSearch = vi
      .fn()
      .mockResolvedValueOnce({ total: 0, supported: true, truncated: false })
      .mockResolvedValueOnce({ total: 0, supported: false, truncated: false });

    render(
      <ReaderSearchSheet
        open
        onOpenChange={onOpenChange}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.green}
        onSearch={onSearch}
        onClearSearch={vi.fn()}
        onSelectResult={vi.fn()}
      />,
    );

    const searchInput = screen.getByRole("searchbox", { name: "书内全文搜索" });
    fireEvent.change(searchInput, { target: { value: "不存在的词" } });
    fireEvent.submit(searchInput.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("未找到匹配内容")).toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: "扫描PDF" } });
    fireEvent.submit(searchInput.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("当前书籍暂不支持全文搜索")).toBeInTheDocument();
    });

    // Escape clears query first without closing drawer
    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(searchInput).toHaveValue("");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("steps between search matches cleanly without closing the search drawer", async () => {
    const firstResult = makeResult({ cfi: "epubcfi(/6/4!/4/2)", sectionLabel: "第一章" });
    const secondResult = makeResult({ cfi: "epubcfi(/6/6!/4/8)", sectionLabel: "第二章" });
    const onOpenChange = vi.fn();
    const onSelectResult = vi.fn();
    const onSearch = vi.fn(
      async (_query: string, callbacks?: BookSearchCallbacks): Promise<BookSearchOutcome> => {
        callbacks?.onResults?.([firstResult, secondResult]);
        return { total: 2, supported: true, truncated: false };
      },
    );

    render(
      <ReaderSearchSheet
        open
        onOpenChange={onOpenChange}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.light}
        onSearch={onSearch}
        onClearSearch={vi.fn()}
        onSelectResult={onSelectResult}
      />,
    );

    const searchInput = screen.getByRole("searchbox", { name: "书内全文搜索" });
    fireEvent.change(searchInput, { target: { value: "书页" } });
    fireEvent.submit(searchInput.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("找到 2 处匹配")).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole("button", { name: "下一处匹配" });
    const prevBtn = screen.getByRole("button", { name: "上一处匹配" });

    fireEvent.click(nextBtn);
    expect(onSelectResult).toHaveBeenNthCalledWith(1, firstResult.cfi);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(nextBtn);
    expect(onSelectResult).toHaveBeenNthCalledWith(2, secondResult.cfi);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    fireEvent.click(prevBtn);
    expect(onSelectResult).toHaveBeenNthCalledWith(3, firstResult.cfi);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: "F3" });
    expect(onSelectResult).toHaveBeenNthCalledWith(4, secondResult.cfi);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: "F3", shiftKey: true });
    expect(onSelectResult).toHaveBeenNthCalledWith(5, firstResult.cfi);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("records recent searches, reruns on chip click, clears history, and retries after errors", async () => {
    const onSearch = vi
      .fn()
      .mockResolvedValueOnce({ total: 1, supported: true, truncated: false })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ total: 1, supported: true, truncated: false });

    render(
      <ReaderSearchSheet
        open
        onOpenChange={vi.fn()}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.light}
        onSearch={onSearch}
        onClearSearch={vi.fn()}
        onSelectResult={vi.fn()}
      />,
    );

    const searchInput = screen.getByRole("searchbox", { name: "书内全文搜索" });
    fireEvent.change(searchInput, { target: { value: "月光" } });
    fireEvent.submit(searchInput.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("未找到匹配内容")).toBeInTheDocument();
    });

    // Clear input -> initial prompt with recent search chip
    fireEvent.change(searchInput, { target: { value: "" } });
    fireEvent.submit(searchInput.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("最近搜索")).toBeInTheDocument();
    });

    const recentBtn = screen.getByRole("button", { name: "月光" });
    fireEvent.click(recentBtn);

    await waitFor(() => {
      expect(screen.getByText("搜索失败，请稍后重试")).toBeInTheDocument();
    });
    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "重试搜索" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试搜索" }));
    await waitFor(() => {
      expect(screen.getByText("未找到匹配内容")).toBeInTheDocument();
    });
    expect(onSearch).toHaveBeenCalledTimes(3);

    fireEvent.change(searchInput, { target: { value: "" } });
    fireEvent.submit(searchInput.closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "清空最近搜索" }));
    expect(screen.queryByText("最近搜索")).not.toBeInTheDocument();
  });
});
