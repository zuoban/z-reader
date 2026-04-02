'use client';

import { ReaderTheme, ThemeColors } from '@/hooks/useReaderTheme';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Settings, BookOpen, ScrollText, Zap, ZapOff } from 'lucide-react';

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
    background: `${uiScheme.cardBg}f8`,
    borderColor: `${uiScheme.cardBorder}50`,
    color: uiScheme.fg,
    boxShadow: `0 32px 80px ${uiScheme.cardBorder}28, 0 8px 24px ${uiScheme.cardBorder}18, inset 0 1px 0 rgba(255,255,255,0.5)`,
  } as const;

  const sectionStyle = {
    background: `${uiScheme.buttonBg}38`,
    borderColor: `${uiScheme.cardBorder}35`,
  } as const;

  const triggerClassName = 'h-8 w-8 rounded-full border transition-all duration-200 hover:scale-[1.03] active:scale-95 sm:h-9 sm:w-9';
  const triggerStyle = {
    color: open ? uiScheme.link : uiScheme.buttonText,
    background: open ? `${uiScheme.link}10` : `${uiScheme.buttonBg}85`,
    border: `1px solid ${open ? `${uiScheme.link}33` : `${uiScheme.cardBorder}7a`}`,
    boxShadow: open
      ? `inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 1px ${uiScheme.link}14`
      : `inset 0 1px 0 ${uiScheme.headerBg}66`,
  } as const;

  // 分段控制器样式
  const segmentedBgStyle = {
    background: `${uiScheme.cardBorder}30`,
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
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
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton
        finalFocus={false}
        className="w-[92vw] max-w-[420px] overflow-hidden rounded-l-[24px] p-0 backdrop-blur-xl sm:w-[420px] sm:max-w-[420px]"
        style={{
          ...panelStyle,
        }}
      >
        <SheetHeader
          className="border-b px-5 py-4 pb-3 pr-14"
          style={{ borderColor: `${uiScheme.cardBorder}40` }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle className="font-heading text-base sm:text-lg" style={{ color: uiScheme.fg }}>
                阅读偏好
              </SheetTitle>
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
          </SheetHeader>

        <div className="max-h-[calc(100vh-80px)] space-y-4 overflow-y-auto p-4 sm:p-5">
          {/* 主题选择 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>
                阅读主题
              </Label>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => {
                const isActive = theme.preset === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setTheme({ preset: p.key })}
                    className="group relative flex flex-col items-center gap-1.5"
                    title={p.label}
                  >
                    {/* 色块 */}
                    <div
                      className="w-full aspect-[4/3] rounded-lg border transition-all duration-200"
                      style={{
                        background: p.bg,
                        borderColor: isActive ? uiScheme.link : `${uiScheme.cardBorder}40`,
                        borderWidth: isActive ? '2px' : '1px',
                        boxShadow: isActive
                          ? `0 0 0 3px ${uiScheme.link}20`
                          : `0 1px 2px ${uiScheme.cardBorder}20`,
                      }}
                    >
                      {/* 选中指示器 */}
                      {isActive && (
                        <div className="absolute top-1.5 right-1.5">
                          <div
                            className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
                            style={{ background: uiScheme.link }}
                          >
                            <svg
                              className="w-2.5 h-2.5 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* 标签 */}
                    <span
                      className="text-[10px] font-medium transition-colors duration-200"
                      style={{
                        color: isActive ? uiScheme.link : uiScheme.mutedText,
                      }}
                    >
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="h-px" style={{ background: `${uiScheme.cardBorder}30` }} />

          {/* 字体大小滑块 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>
                字体大小
              </Label>
              <span
                className="text-xs font-mono tabular-nums px-2 py-0.5 rounded-md"
                style={{
                  color: uiScheme.link,
                  background: `${uiScheme.link}15`,
                }}
              >
                {theme.fontSize}px
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px]" style={{ color: uiScheme.mutedText }}>12</span>
              <Slider
                value={[theme.fontSize]}
                onValueChange={([v]) => setTheme({ fontSize: v })}
                min={12}
                max={28}
                step={1}
                className="flex-1"
              />
              <span className="text-[10px]" style={{ color: uiScheme.mutedText }}>28</span>
            </div>
            {/* 预览文字 */}
            <p
              className="text-center py-2 rounded-lg"
              style={{
                fontSize: `${theme.fontSize}px`,
                lineHeight: theme.lineHeight,
                color: uiScheme.mutedText,
                background: `${uiScheme.cardBorder}20`,
              }}
            >
              阅读预览文字
            </p>
          </div>

          {/* 行高滑块 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>
                行高
              </Label>
              <span
                className="text-xs font-mono tabular-nums px-2 py-0.5 rounded-md"
                style={{
                  color: uiScheme.link,
                  background: `${uiScheme.link}15`,
                }}
              >
                {theme.lineHeight.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px]" style={{ color: uiScheme.mutedText }}>1.4</span>
              <Slider
                value={[theme.lineHeight]}
                onValueChange={([v]) => setTheme({ lineHeight: v })}
                min={1.4}
                max={2.0}
                step={0.1}
                className="flex-1"
              />
              <span className="text-[10px]" style={{ color: uiScheme.mutedText }}>2.0</span>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="h-px" style={{ background: `${uiScheme.cardBorder}30` }} />

          {/* 翻页/滚动 - 分段控制器 */}
          <div className="space-y-2">
            <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>
              阅读模式
            </Label>
            <div
              className="flex rounded-xl p-1"
              style={segmentedBgStyle}
            >
              {(['paginated', 'scrolled'] as const).map((flow) => (
                <button
                  key={flow}
                  onClick={() => setTheme({ flow })}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition-all duration-200"
                  style={{
                    color: theme.flow === flow ? uiScheme.fg : uiScheme.mutedText,
                    background: theme.flow === flow ? `${uiScheme.cardBg}cc` : 'transparent',
                    boxShadow: theme.flow === flow ? `0 1px 3px ${uiScheme.cardBorder}30` : 'none',
                  }}
                >
                  {flow === 'paginated' ? (
                    <BookOpen className="h-3.5 w-3.5" />
                  ) : (
                    <ScrollText className="h-3.5 w-3.5" />
                  )}
                  {flow === 'paginated' ? '翻页' : '滚动'}
                </button>
              ))}
            </div>
          </div>

          {/* 正文宽度滑块 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>
                正文宽度
              </Label>
              <span
                className="text-xs font-mono tabular-nums px-2 py-0.5 rounded-md"
                style={{
                  color: uiScheme.link,
                  background: `${uiScheme.link}15`,
                }}
              >
                {theme.maxInlineSize}px
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px]" style={{ color: uiScheme.mutedText }}>紧凑</span>
              <Slider
                value={[theme.maxInlineSize]}
                onValueChange={([v]) => setTheme({ maxInlineSize: v })}
                min={760}
                max={1440}
                step={80}
                className="flex-1"
              />
              <span className="text-[10px]" style={{ color: uiScheme.mutedText }}>铺满</span>
            </div>
            {/* 宽度指示条 */}
            <div className="flex justify-between px-1">
              {[760, 960, 1200, 1440].map((w) => (
                <div
                  key={w}
                  className="h-1 w-1 rounded-full"
                  style={{
                    background: Math.abs(theme.maxInlineSize - w) < 40
                      ? uiScheme.link
                      : `${uiScheme.cardBorder}60`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* 页间距滑块 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>
                页间距
              </Label>
              <span
                className="text-xs font-mono tabular-nums px-2 py-0.5 rounded-md"
                style={{
                  color: uiScheme.link,
                  background: `${uiScheme.link}15`,
                }}
              >
                {theme.gap === 0 ? '无' : theme.gap <= 3 ? '紧凑' : theme.gap <= 5 ? '标准' : theme.gap <= 7 ? '舒展' : '宽敞'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px]" style={{ color: uiScheme.mutedText }}>无</span>
              <Slider
                value={[theme.gap]}
                onValueChange={([v]) => setTheme({ gap: v })}
                min={0}
                max={10}
                step={1}
                className="flex-1"
              />
              <span className="text-[10px]" style={{ color: uiScheme.mutedText }}>宽敞</span>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="h-px" style={{ background: `${uiScheme.cardBorder}30` }} />

          {/* 动画开关 */}
          <div className="flex items-center justify-between rounded-xl border p-3" style={sectionStyle}>
            <div className="flex items-center gap-2">
              {theme.animated ? (
                <Zap className="h-4 w-4" style={{ color: uiScheme.link }} />
              ) : (
                <ZapOff className="h-4 w-4" style={{ color: uiScheme.mutedText }} />
              )}
              <Label className="font-heading text-xs sm:text-sm" style={{ color: uiScheme.fg }}>
                翻页动画
              </Label>
            </div>
            <button
              onClick={() => setTheme({ animated: !theme.animated })}
              className="relative flex items-center justify-start rounded-[12px] transition-colors duration-200"
              style={{
                width: '48px',
                height: '26px',
                minWidth: '48px',
                minHeight: '26px',
                maxWidth: '48px',
                maxHeight: '26px',
                backgroundColor: theme.animated ? uiScheme.link : `${uiScheme.cardBorder}60`,
              }}
              aria-checked={theme.animated}
              role="switch"
            >
              {/* 滑块 */}
              <span
                className="rounded-full bg-white shadow transition-transform duration-200"
                style={{
                  width: '22px',
                  height: '22px',
                  marginLeft: theme.animated ? '24px' : '2px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
