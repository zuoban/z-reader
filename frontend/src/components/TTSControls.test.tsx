import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { TTSControls } from '@/components/TTSControls';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import type { TTSSettings } from '@/lib/tts';

const uiScheme: ThemeColors = {
  bg: '#ffffff',
  fg: '#111111',
  mutedText: '#666666',
  link: '#0066cc',
  headerBg: '#ffffff',
  headerBorder: '#dddddd',
  cardBg: '#ffffff',
  cardBorder: '#dddddd',
  buttonBg: '#f5f5f5',
  buttonHoverBg: '#eeeeee',
  buttonText: '#111111',
  muted: '#f5f5f5',
  accentText: '#0066cc',
};

const settings: TTSSettings = {
  voiceName: '',
  rate: 0,
  highlightMode: 'sentence',
};

describe('TTSControls', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
      writable: true,
    });
  });

  it('uses text-button sizing for a custom toolbar trigger', () => {
    render(
      <TTSControls
        state="stopped"
        settings={settings}
        voices={[]}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
        onUpdateSettings={vi.fn()}
        uiScheme={uiScheme}
        variant="toolbar"
        triggerClassName="toolbar-trigger"
        triggerStyle={{}}
        triggerContent={<span>朗读</span>}
      />,
    );

    expect(screen.getByRole('button', { name: '朗读控制' })).not.toHaveClass('size-11');
  });
});
