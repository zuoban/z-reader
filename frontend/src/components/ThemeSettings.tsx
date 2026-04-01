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
    background: `${uiScheme.cardBg}f2`,
    borderColor: `${uiScheme.cardBorder}88`,
    color: uiScheme.fg,
    boxShadow: `0 18px 48px ${uiScheme.cardBorder}26, inset 0 1px 0 rgba(255,255,255,0.42)`,
  } as const;
  const sectionStyle = {
    background: `${uiScheme.buttonBg}66`,
    borderColor: `${uiScheme.cardBorder}70`,
  } as const;
  const chipButtonStyle = (active: boolean) => ({
    background: active ? `${uiScheme.link}18` : `${uiScheme.buttonBg}52`,
    color: active ? uiScheme.link : uiScheme.mutedText,
    border: `1px solid ${active ? `${uiScheme.link}40` : `${uiScheme.cardBorder}55`}`,
    boxShadow: active ? `inset 0 1px 0 rgba(255,255,255,0.35)` : 'none',
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
        className="max-w-[90vw] sm:max-w-sm backdrop-blur-xl rounded-[24px] p-0 overflow-hidden"
        closeButtonClassName="text-current hover:bg-muted/30 hover:text-current"
        style={panelStyle}
      >
        <DialogHeader className="border-b px-5 py-4 pb-3" style={{ borderColor: `${uiScheme.cardBorder}55` }}>
          <DialogTitle className="font-heading text-base sm:text-lg" style={{ color: uiScheme.fg }}>
            阅读偏好
          </DialogTitle>
          <p className="text-xs" style={{ color: uiScheme.mutedText }}>
            调整页面氛围与排版节奏
          </p>
        </DialogHeader>

        <div className="space-y-3 p-4 sm:p-5">
          <div className="space-y-2 rounded-2xl border p-3 sm:p-4" style={sectionStyle}>
            <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>主题</Label>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTheme({ preset: p.key })}
                  className="rounded-md p-1.5 sm:p-2 flex flex-col items-center gap-1 sm:gap-1.5 border transition-all duration-200"
                  style={{
                    background: p.bg,
                    borderColor: theme.preset === p.key ? uiScheme.link : `${uiScheme.cardBorder}80`,
                    boxShadow: theme.preset === p.key ? `0 0 0 2px ${uiScheme.link}30` : 'none',
                  }}
                >
                  <div
                    className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border"
                    style={{ background: p.fg, borderColor: `${uiScheme.cardBorder}60` }}
                  />
                  <span
                    className="font-sans text-[10px] sm:text-xs"
                    style={{ color: p.fg }}
                  >
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border p-3 sm:p-4" style={sectionStyle}>
            <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>字体大小</Label>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => setTheme({ fontSize: Math.max(12, theme.fontSize - 2) })}
                disabled={theme.fontSize <= 12}
                className="border-border/40 h-7 w-7 sm:h-8 sm:w-8"
                style={{
                  borderColor: uiScheme.cardBorder,
                  background: uiScheme.buttonBg,
                  color: uiScheme.buttonText,
                }}
              >
                −
              </Button>
              <span
                className="w-12 sm:w-14 text-center font-mono text-xs sm:text-sm tabular-nums"
                style={{ color: uiScheme.fg }}
              >
                {theme.fontSize}px
              </span>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => setTheme({ fontSize: Math.min(28, theme.fontSize + 2) })}
                disabled={theme.fontSize >= 28}
                className="border-border/40 h-7 w-7 sm:h-8 sm:w-8"
                style={{
                  borderColor: uiScheme.cardBorder,
                  background: uiScheme.buttonBg,
                  color: uiScheme.buttonText,
                }}
              >
                +
              </Button>
            </div>
            <div className="flex gap-1">
              {[14, 16, 18, 20, 22].map((size) => (
                <Button
                  key={size}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ fontSize: size })}
                  className="flex-1 font-mono text-[10px] sm:text-xs transition-all duration-200 rounded h-7 sm:h-8"
                  style={chipButtonStyle(theme.fontSize === size)}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border p-3 sm:p-4" style={sectionStyle}>
            <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>行高</Label>
            <div className="flex gap-1">
              {[1.4, 1.5, 1.6, 1.8, 2.0].map((lh) => (
                <Button
                  key={lh}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ lineHeight: lh })}
                  className="flex-1 font-mono text-[10px] sm:text-xs transition-all duration-200 rounded h-7 sm:h-8"
                  style={chipButtonStyle(theme.lineHeight === lh)}
                >
                  {lh}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2 rounded-2xl border p-3 sm:p-4" style={sectionStyle}>
            <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>页边距</Label>
            <div className="flex gap-1">
              {[20, 40, 60, 80, 100].map((m) => (
                <Button
                  key={m}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ margin: m })}
                  className="flex-1 font-mono text-[10px] sm:text-xs transition-all duration-200 rounded h-7 sm:h-8"
                  style={chipButtonStyle(theme.margin === m)}
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
