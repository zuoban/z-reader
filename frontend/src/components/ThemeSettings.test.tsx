import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ThemeSettings } from '@/components/ThemeSettings';
import {
  DEFAULT_READER_THEME,
  FONT_FAMILY_OPTIONS,
  PRESET_STYLES,
} from '@/hooks/useReaderTheme';
import type { ReaderTheme } from '@/hooks/useReaderTheme';

describe('ThemeSettings preview', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      })),
      writable: true,
    });
  });

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
  });
});
