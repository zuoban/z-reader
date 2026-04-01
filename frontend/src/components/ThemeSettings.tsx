'use client';

import { ReaderTheme, ThemeColors } from '@/hooks/useReaderTheme';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Settings } from 'lucide-react';

const PRESETS = [
  { key: 'light', label: '明亮', bg: '#ffffff', fg: '#333333' },
  { key: 'sepia', label: '纸张', bg: '#f4ecd8', fg: '#5c4b37' },
  { key: 'green', label: '森林', bg: '#cce8cf', fg: '#2d4a3e' },
  { key: 'dark', label: '夜间', bg: '#1e293b', fg: '#e2e8f0' },
] as const;
const WIDTH_PRESETS = [
  { label: '紧凑', value: 760 },
  { label: '标准', value: 960 },
  { label: '宽版', value: 1200 },
  { label: '铺满', value: 1440 },
] as const;
const GAP_PRESETS = [
  { label: '极小', value: 0 },
  { label: '紧凑', value: 2 },
  { label: '标准', value: 4 },
  { label: '舒展', value: 6 },
] as const;

interface ThemeSettingsProps {
  theme: ReaderTheme;
  setTheme: (theme: Partial<ReaderTheme>) => void;
  uiScheme: ThemeColors;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ThemeSettings({
  theme,
  setTheme,
  uiScheme,
  open,
  onOpenChange,
}: ThemeSettingsProps) {
  const panelStyle = {
    background: `${uiScheme.cardBg}f4`,
    borderColor: `${uiScheme.cardBorder}72`,
    color: uiScheme.fg,
    boxShadow: `0 24px 60px ${uiScheme.cardBorder}22, inset 0 1px 0 rgba(255,255,255,0.42)`,
  } as const;
  const sectionStyle = {
    background: `${uiScheme.buttonBg}42`,
    borderColor: `${uiScheme.cardBorder}4d`,
  } as const;
  const chipButtonStyle = (active: boolean) => ({
    background: active ? `${uiScheme.link}14` : `${uiScheme.buttonBg}40`,
    color: active ? uiScheme.link : uiScheme.mutedText,
    border: `1px solid ${active ? `${uiScheme.link}36` : `${uiScheme.cardBorder}44`}`,
    boxShadow: active
      ? `inset 0 1px 0 rgba(255,255,255,0.35), 0 0 0 1px ${uiScheme.link}10`
      : 'none',
  });
  const triggerClassName = 'h-8 w-8 rounded-full border transition-all duration-200 hover:scale-[1.03] active:scale-95 sm:h-9 sm:w-9';
  const triggerStyle = {
    color: open ? uiScheme.link : uiScheme.buttonText,
    background: open ? `${uiScheme.link}10` : `${uiScheme.buttonBg}85`,
    border: `1px solid ${open ? `${uiScheme.link}33` : `${uiScheme.cardBorder}7a`}`,
    boxShadow: open
      ? `inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 1px ${uiScheme.link}14`
      : `inset 0 1px 0 ${uiScheme.headerBg}66`,
  } as const;
  const controlButtonStyle = {
    borderColor: uiScheme.cardBorder,
    background: `${uiScheme.buttonBg}78`,
    color: uiScheme.buttonText,
  } as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            title="阅读设置"
            className={triggerClassName}
            style={triggerStyle}
          />
        }
      >
        <Settings className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent
        className="max-w-[92vw] overflow-hidden rounded-[24px] p-0 backdrop-blur-xl sm:max-w-md"
        closeButtonClassName="text-current hover:bg-muted/30 hover:text-current"
        style={panelStyle}
      >
        <DialogHeader
          className="border-b px-5 py-4 pb-3"
          style={{ borderColor: `${uiScheme.cardBorder}40` }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="font-heading text-base sm:text-lg" style={{ color: uiScheme.fg }}>
                阅读偏好
              </DialogTitle>
              <p className="mt-1 text-xs" style={{ color: uiScheme.mutedText }}>
                调整页面氛围、文字密度与阅读方式
              </p>
            </div>
            <div
              className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-[0.18em]"
              style={{
                color: uiScheme.accentText,
                background: `${uiScheme.buttonBg}54`,
                borderColor: `${uiScheme.cardBorder}40`,
              }}
            >
              READER
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 p-4 sm:p-5">
          <div className="rounded-[22px] border p-3 sm:p-4" style={sectionStyle}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>
                主题
              </Label>
              <p className="text-[11px]" style={{ color: uiScheme.mutedText }}>
                选择阅读底色
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTheme({ preset: p.key })}
                  className="flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2 transition-all duration-200"
                  style={{
                    background: p.bg,
                    borderColor: theme.preset === p.key ? uiScheme.link : `${uiScheme.cardBorder}72`,
                    boxShadow: theme.preset === p.key ? `0 0 0 2px ${uiScheme.link}26` : 'none',
                  }}
                >
                  <div
                    className="h-3.5 w-3.5 rounded-full border"
                    style={{ background: p.fg, borderColor: `${uiScheme.cardBorder}60` }}
                  />
                  <span className="font-sans text-[10px] sm:text-xs" style={{ color: p.fg }}>
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border p-3 sm:p-4" style={sectionStyle}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>
                  字体大小
                </Label>
                <span className="text-xs font-mono tabular-nums" style={{ color: uiScheme.fg }}>
                  {theme.fontSize}px
                </span>
              </div>
              <div className="mb-2 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => setTheme({ fontSize: Math.max(12, theme.fontSize - 2) })}
                  disabled={theme.fontSize <= 12}
                  className="h-8 w-8 rounded-full border-border/40"
                  style={controlButtonStyle}
                >
                  −
                </Button>
                <div
                  className="flex h-8 flex-1 items-center justify-center rounded-full border text-xs"
                  style={{
                    borderColor: `${uiScheme.cardBorder}40`,
                    background: `${uiScheme.buttonBg}32`,
                    color: uiScheme.mutedText,
                  }}
                >
                  当前字号
                </div>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => setTheme({ fontSize: Math.min(28, theme.fontSize + 2) })}
                  disabled={theme.fontSize >= 28}
                  className="h-8 w-8 rounded-full border-border/40"
                  style={controlButtonStyle}
                >
                  +
                </Button>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[14, 16, 18, 20, 22].map((size) => (
                  <Button
                    key={size}
                    variant="ghost"
                    size="sm"
                    onClick={() => setTheme({ fontSize: size })}
                    className="h-8 rounded-lg font-mono text-[10px] sm:text-xs"
                    style={chipButtonStyle(theme.fontSize === size)}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border p-3 sm:p-4" style={sectionStyle}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>
                  行高
                </Label>
                <span className="text-xs font-mono tabular-nums" style={{ color: uiScheme.fg }}>
                  {theme.lineHeight}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[1.4, 1.5, 1.6, 1.8, 2.0].map((lh) => (
                  <Button
                    key={lh}
                    variant="ghost"
                    size="sm"
                    onClick={() => setTheme({ lineHeight: lh })}
                    className="h-8 rounded-lg font-mono text-[10px] sm:text-xs"
                    style={chipButtonStyle(theme.lineHeight === lh)}
                  >
                    {lh}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border p-3 sm:p-4" style={sectionStyle}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>
                布局
              </Label>
              <p className="text-[11px]" style={{ color: uiScheme.mutedText }}>
                控制正文展示方式
              </p>
            </div>

            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ flow: 'paginated' })}
                  className="h-9 rounded-xl text-xs sm:text-sm"
                  style={chipButtonStyle(theme.flow === 'paginated')}
                >
                  翻页
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ flow: 'scrolled' })}
                  className="h-9 rounded-xl text-xs sm:text-sm"
                  style={chipButtonStyle(theme.flow === 'scrolled')}
                >
                  滚动
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-[11px] sm:text-xs" style={{ color: uiScheme.mutedText }}>
                    正文宽度
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {WIDTH_PRESETS.map((preset) => (
                      <Button
                        key={preset.value}
                        variant="ghost"
                        size="sm"
                        onClick={() => setTheme({ maxInlineSize: preset.value })}
                        className="h-8 rounded-lg text-[10px] sm:text-xs"
                        style={chipButtonStyle(theme.maxInlineSize === preset.value)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] sm:text-xs" style={{ color: uiScheme.mutedText }}>
                    页间距
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {GAP_PRESETS.map((preset) => (
                      <Button
                        key={preset.value}
                        variant="ghost"
                        size="sm"
                        onClick={() => setTheme({ gap: preset.value })}
                        className="h-8 rounded-lg text-[10px] sm:text-xs"
                        style={chipButtonStyle(theme.gap === preset.value)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ animated: true })}
                  className="h-9 rounded-xl text-xs sm:text-sm"
                  style={chipButtonStyle(theme.animated)}
                >
                  动画开
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ animated: false })}
                  className="h-9 rounded-xl text-xs sm:text-sm"
                  style={chipButtonStyle(!theme.animated)}
                >
                  动画关
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
