import { fireEvent, render, screen } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { TTSRateButtons } from '@/components/tts/TTSPlaybackControls';
import { TTSHighlightModeGroup, TTSSleepTimerGroup } from '@/components/tts/TTSSettingsGroups';
import { TTSStatusBanner } from '@/components/tts/TTSStatusBanner';

describe('TTS extracted subcomponents', () => {
  it('renders rate options with active aria-pressed state and calls onChange', () => {
    const onChange = vi.fn();
    render(<TTSRateButtons value={25} onChange={onChange} />);

    expect(screen.getByRole('button', { name: '1.25倍' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '1.5倍' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '1.5倍' }));
    expect(onChange).toHaveBeenCalledWith(50);
  });

  it('switches highlight mode between word and sentence', () => {
    const onChange = vi.fn();
    render(<TTSHighlightModeGroup value="sentence" onChange={onChange} variant="drawer" />);

    expect(screen.getByRole('button', { name: '句子' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '词语' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '词语' }));
    expect(onChange).toHaveBeenCalledWith('word');
  });

  it('handles sleep timer minutes and enables cancel only when timer is active', () => {
    const onMinutes = vi.fn();
    const onClear = vi.fn();
    const { rerender } = render(
      <TTSSleepTimerGroup
        sleepTimer={{ mode: 'off', label: '关闭' }}
        sleepTimerActive={false}
        onSleepTimerMinutes={onMinutes}
        onClearSleepTimer={onClear}
        variant="floating"
      />
    );

    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '30分' }));
    expect(onMinutes).toHaveBeenCalledWith(30);

    rerender(
      <TTSSleepTimerGroup
        sleepTimer={{ mode: 'minutes', minutes: 30, label: '30 分钟后停止' }}
        sleepTimerActive
        onSleepTimerMinutes={onMinutes}
        onClearSleepTimer={onClear}
        variant="floating"
      />
    );

    expect(screen.getByRole('button', { name: '30分' })).toHaveAttribute('aria-pressed', 'true');
    const cancelBtn = screen.getByRole('button', { name: '取消' });
    expect(cancelBtn).toBeEnabled();
    fireEvent.click(cancelBtn);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('renders TTSStatusBanner with alert role for errors and optional drag handle', () => {
    const onPointerDown = vi.fn();
    render(
      <TTSStatusBanner
        ttsStatus={{ headline: '网络中断', detail: '等待恢复', tone: 'error' }}
        isActive={false}
        withDragHandle
        onDragHandlePointerDown={onPointerDown}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('网络中断');
    expect(alert).toHaveTextContent('等待恢复');

    const dragHandle = screen.getByRole('button', { name: '拖动控制面板' });
    fireEvent.pointerDown(dragHandle);
    expect(onPointerDown).toHaveBeenCalledOnce();
  });
});
