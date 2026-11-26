import { fireEvent, render, screen, within } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';

import { ThemeSettings } from '@/components/ThemeSettings';
import {
  DEFAULT_READER_THEME,
  FONT_FAMILY_OPTIONS,
  PRESET_STYLES,
} from '@/hooks/useReaderTheme';
import type { ReaderTheme } from '@/hooks/useReaderTheme';

describe('ThemeSettings preview', () => {
  function renderSettings(overrides: Partial<ReaderTheme> = {}) {
    const theme = { ...DEFAULT_READER_THEME, ...overrides };
    const setTheme = vi.fn();
    const view = render(
      <ThemeSettings theme={theme} setTheme={setTheme} uiScheme={PRESET_STYLES.light} open />,
    );
    return { ...view, setTheme, theme };
  }

  it.each([12, 32])('previews the actual selected %ipx font size', (fontSize) => {
    renderSettings({ fontSize, fontFamily: 'classic', lineHeight: 1.85 });
    const preview = screen.getByRole('region', { name: '阅读效果预览' });
    const passage = within(preview).getByText(/文字应该安静地留在页面里/);

    expect(passage).toHaveStyle({
      fontSize: `${fontSize}px`,
      lineHeight: '1.85',
      fontFamily: FONT_FAMILY_OPTIONS.classic.stack,
    });
    expect(preview.querySelectorAll('p')).toHaveLength(1);
  });

  it('offers an accessible collapse control and keeps all settings reachable', () => {
    const { setTheme } = renderSettings({ fontSize: 24 });
    const preview = screen.getByRole('region', { name: '阅读效果预览' });
    const collapse = within(preview).getByRole('button', { name: '收起预览' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    const passageId = collapse.getAttribute('aria-controls');
    expect(passageId).toBeTruthy();
    expect(document.getElementById(passageId!)).toBeVisible();

    fireEvent.click(collapse);
    expect(within(preview).getByRole('button', { name: '展开预览' }))
      .toHaveAttribute('aria-expanded', 'false');
    expect(within(preview).queryByText(/文字应该安静地留在页面里/)).not.toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: '排版' }));
    fireEvent.click(screen.getByRole('button', { name: /书卷楷体/ }));
    expect(setTheme).toHaveBeenCalledWith({ fontFamily: 'classic' });
    fireEvent.click(screen.getByRole('tab', { name: '高级' }));
    expect(screen.getByRole('tabpanel', { name: '高级排版设置' })).toBeVisible();
    fireEvent.click(within(preview).getByRole('button', { name: '展开预览' }));
    expect(document.getElementById(passageId!)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '重置阅读偏好' }));
    expect(setTheme).toHaveBeenCalledWith(DEFAULT_READER_THEME);
    expect(screen.getByRole('status')).toHaveTextContent('已恢复默认');
  });

  it('steps slider values precisely and disables steppers at bounds', () => {
    const { setTheme, rerender } = renderSettings({
      fontSize: 12,
      lineHeight: 1.6,
    });

    fireEvent.click(screen.getByRole('tab', { name: '排版' }));

    const decreaseFont = screen.getByRole('button', { name: '减小字号大小' });
    const increaseFont = screen.getByRole('button', { name: '增大字号大小' });
    const increaseLineHeight = screen.getByRole('button', { name: '增大行间距' });

    expect(decreaseFont).toBeDisabled();
    expect(increaseFont).toBeEnabled();

    fireEvent.click(increaseFont);
    expect(setTheme).toHaveBeenCalledWith({ fontSize: 13 });

    fireEvent.click(increaseLineHeight);
    expect(setTheme).toHaveBeenCalledWith({ lineHeight: 1.65 });

    rerender(
      <ThemeSettings
        theme={{ ...DEFAULT_READER_THEME, fontSize: 32, lineHeight: 2.2 }}
        setTheme={setTheme}
        uiScheme={PRESET_STYLES.dark}
        open
      />,
    );

    expect(screen.getByRole('button', { name: '增大字号大小' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '增大行间距' })).toBeDisabled();
  });

  it('applies quick typography presets in the layout tab', () => {
    const { setTheme, rerender } = renderSettings({
      fontSize: 17,
      lineHeight: 1.7,
      paragraphSpacing: 1.15,
    });

    fireEvent.click(screen.getByRole('tab', { name: '排版' }));

    const standardButton = screen.getByRole('button', { name: /标准/ });
    const compactButton = screen.getByRole('button', { name: /紧凑/ });
    const relaxedButton = screen.getByRole('button', { name: /舒适/ });

    expect(standardButton).toHaveAttribute('aria-pressed', 'true');
    expect(compactButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(compactButton);
    expect(setTheme).toHaveBeenCalledWith({
      fontSize: 15,
      lineHeight: 1.55,
      paragraphSpacing: 0.95,
    });

    rerender(
      <ThemeSettings
        theme={{
          ...DEFAULT_READER_THEME,
          fontSize: 19,
          lineHeight: 1.85,
          paragraphSpacing: 1.35,
        }}
        setTheme={setTheme}
        uiScheme={PRESET_STYLES.light}
        open
      />,
    );

    expect(relaxedButton).toHaveAttribute('aria-pressed', 'true');
    expect(standardButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies quick page-measure presets in the advanced tab', () => {
    const { setTheme } = renderSettings({
      pagePaddingX: 22,
      maxInlineSize: 1200,
    });

    fireEvent.click(screen.getByRole('tab', { name: '高级' }));

    const wideButton = screen.getByRole('button', { name: /宽幅/ });
    const focusedButton = screen.getByRole('button', { name: /专注/ });

    expect(wideButton).toHaveAttribute('aria-pressed', 'true');
    expect(focusedButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(focusedButton);
    expect(setTheme).toHaveBeenCalledWith({
      pagePaddingX: 36,
      maxInlineSize: 720,
    });
  });

  it('displays live preview summary and per-tab customization indicators only when modified', () => {
    const { container, rerender } = render(
      <ThemeSettings
        theme={DEFAULT_READER_THEME}
        setTheme={vi.fn()}
        uiScheme={PRESET_STYLES.light}
        open
      />,
    );

    expect(container.querySelector('[data-theme-customized="true"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-tab-customized]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-preview-summary="true"]')).toHaveTextContent(
      `净白 · ${FONT_FAMILY_OPTIONS[DEFAULT_READER_THEME.fontFamily].label} · 17px / 1.70`,
    );

    rerender(
      <ThemeSettings
        theme={{
          ...DEFAULT_READER_THEME,
          preset: 'sepia',
          fontFamily: 'classic',
          fontSize: 19,
          lineHeight: 1.85,
          maxInlineSize: 720,
        }}
        setTheme={vi.fn()}
        uiScheme={PRESET_STYLES.sepia}
        open
      />,
    );

    expect(container.querySelector('[data-theme-customized="true"]')).toHaveTextContent('已自定义');
    expect(container.querySelector('[data-tab-customized="appearance"]')).toBeInTheDocument();
    expect(container.querySelector('[data-tab-customized="layout"]')).toBeInTheDocument();
    expect(container.querySelector('[data-tab-customized="advanced"]')).toBeInTheDocument();
    expect(container.querySelector('[data-preview-summary="true"]')).toHaveTextContent(
      `旧书 · ${FONT_FAMILY_OPTIONS.classic.label} · 19px / 1.85`,
    );
  });
});
