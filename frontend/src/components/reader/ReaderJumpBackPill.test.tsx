import { fireEvent, render, screen } from "@/test/render";
import { describe, expect, it, vi } from "vitest";
import { ReaderJumpBackPill } from "@/components/reader/ReaderJumpBackPill";
import { PRESET_STYLES } from "@/hooks/useReaderTheme";

describe("ReaderJumpBackPill", () => {
  it("renders nothing when percentage is null or non-finite", () => {
    const onReturn = vi.fn();
    const onDismiss = vi.fn();

    const { container, rerender } = render(
      <ReaderJumpBackPill
        percentage={null}
        uiScheme={PRESET_STYLES.light}
        safeAreaPaddingBottom="0px"
        isToolbarVisible
        onReturn={onReturn}
        onDismiss={onDismiss}
      />,
    );

    expect(container.querySelector(".reader-jump-back-pill")).toBeNull();
    expect(screen.queryByRole("group", { name: "返回原位" })).not.toBeInTheDocument();

    rerender(
      <ReaderJumpBackPill
        percentage={Number.NaN}
        uiScheme={PRESET_STYLES.light}
        safeAreaPaddingBottom="0px"
        isToolbarVisible
        onReturn={onReturn}
        onDismiss={onDismiss}
      />,
    );

    expect(container.querySelector(".reader-jump-back-pill")).toBeNull();
  });

  it("renders formatted percentage and triggers onReturn and onDismiss", () => {
    const onReturn = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ReaderJumpBackPill
        percentage={34.56}
        uiScheme={PRESET_STYLES.sepia}
        safeAreaPaddingBottom="env(safe-area-inset-bottom, 0px)"
        isToolbarVisible
        onReturn={onReturn}
        onDismiss={onDismiss}
      />,
    );

    const group = screen.getByRole("group", { name: "返回原位" });
    expect(group).toHaveAttribute("data-reader-interactive", "true");
    expect(group.style.getPropertyValue("--reader-panel-bg")).toBe(
      PRESET_STYLES.sepia.cardBg,
    );
    expect(group.style.getPropertyValue("--reader-panel-fg")).toBe(
      PRESET_STYLES.sepia.fg,
    );

    const returnButton = screen.getByRole("button", { name: "返回原位 · 34.6%" });
    expect(returnButton).toHaveTextContent("返回原位 · 34.6%");
    expect(returnButton).toHaveAttribute("data-reader-interactive", "true");

    const dismissButton = screen.getByRole("button", { name: "忽略返回原位" });
    expect(dismissButton).toHaveAttribute("data-reader-interactive", "true");

    fireEvent.click(returnButton);
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it("clamps percentage bounds and respects toolbar visibility in dark theme", () => {
    const onReturn = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ReaderJumpBackPill
        percentage={142}
        uiScheme={PRESET_STYLES.dark}
        safeAreaPaddingBottom="12px"
        isToolbarVisible={false}
        onReturn={onReturn}
        onDismiss={onDismiss}
      />,
    );

    const returnButton = screen.getByRole("button", { name: "返回原位 · 100.0%" });
    expect(returnButton).toHaveTextContent("返回原位 · 100.0%");

    const group = screen.getByRole("group", { name: "返回原位" });
    expect(group.parentElement).toHaveStyle({
      bottom: "calc(3.25rem + 12px)",
    });
  });
});
