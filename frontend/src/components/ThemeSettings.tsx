"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import {
  getModernReaderSurface,
  withOpacity,
} from "@/lib/reader-ui";
import { cn } from "@/lib/utils";
import {
  DEFAULT_READER_THEME,
  FONT_FAMILY_OPTIONS,
  PRESET_STYLES,
  type ReaderTheme,
  type ThemeColors,
} from "@/hooks/useReaderTheme";
import { RotateCcw, Settings, X } from "lucide-react";

const FONT_ORDER: ReaderTheme["fontFamily"][] = [
  "editorial",
  "classic",
  "humanist",
];

const PRESETS = [
  {
    key: "light",
    label: "净白",
    bg: PRESET_STYLES.light.bg,
    fg: PRESET_STYLES.light.fg,
  },
  {
    key: "sepia",
    label: "旧书",
    bg: PRESET_STYLES.sepia.bg,
    fg: PRESET_STYLES.sepia.fg,
  },
  {
    key: "green",
    label: "苔纸",
    bg: PRESET_STYLES.green.bg,
    fg: PRESET_STYLES.green.fg,
  },
  {
    key: "dark",
    label: "夜读",
    bg: PRESET_STYLES.dark.bg,
    fg: PRESET_STYLES.dark.fg,
  },
] as const satisfies ReadonlyArray<{
  key: ReaderTheme["preset"];
  label: string;
  bg: string;
  fg: string;
}>;

const SETTINGS_SECTIONS = [
  { id: "appearance", label: "外观" },
  { id: "layout", label: "排版" },
  { id: "advanced", label: "高级" },
] as const;

type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

interface ThemeSettingsProps {
  theme: ReaderTheme;
  setTheme: (theme: Partial<ReaderTheme>) => void;
  uiScheme: ThemeColors;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  overlayContainer?: HTMLElement | null;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  trigger?: React.ReactNode;
}

interface SectionProps {
  title: string;
  description?: string;
  uiScheme: ThemeColors;
  children: ReactNode;
}

interface SliderFieldProps {
  label: string;
  valueLabel: string;
  minLabel: string;
  maxLabel: string;
  value: number[];
  onValueChange: (value: number[]) => void;
  min: number;
  max: number;
  step: number;
  uiScheme: ThemeColors;
}

function SectionCard({
  title,
  description,
  uiScheme,
  children,
}: SectionProps) {
  return (
    <section
      className="space-y-4 rounded-[1.15rem] border p-4"
      style={{
        background: withOpacity(uiScheme.buttonBg, 0.42),
        borderColor: withOpacity(uiScheme.cardBorder, 0.28),
        boxShadow: `inset 0 1px 0 ${withOpacity("#ffffff", 0.12)}`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h3
            className="text-sm font-semibold tracking-tight"
            style={{ color: uiScheme.fg }}
          >
            {title}
          </h3>
          {description ? (
            <p
              className="text-xs font-medium leading-relaxed"
              style={{ color: uiScheme.mutedText }}
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="pt-1">{children}</div>
    </section>
  );
}

function ValuePill({ label, active, onClick, uiScheme }: { label: string; active: boolean; onClick: () => void; uiScheme: ThemeColors }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "touch-control flex-1 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
      )}
      style={{
        color: active ? uiScheme.fg : withOpacity(uiScheme.fg, 0.62),
        background: active
          ? withOpacity(uiScheme.cardBg, 0.9)
          : withOpacity(uiScheme.buttonBg, 0.32),
        border: `1px solid ${
          active
            ? withOpacity(uiScheme.cardBorder, 0.34)
            : withOpacity(uiScheme.cardBorder, 0.12)
        }`,
        boxShadow: active
          ? `0 8px 16px -14px ${withOpacity(uiScheme.fg, 0.28)}, inset 0 1px 0 ${withOpacity("#ffffff", 0.12)}`
          : "none",
      }}
    >
      {label}
    </button>
  );
}

function SliderField({
  label,
  valueLabel,
  minLabel,
  maxLabel,
  value,
  onValueChange,
  min,
  max,
  step,
  uiScheme,
}: SliderFieldProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <Label
          className="text-xs font-bold tracking-wide text-muted-foreground/80"
        >
          {label}
        </Label>
        <span
          className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary"
        >
          {valueLabel}
        </span>
      </div>
      <div className="flex items-center gap-3.5">
        <span
          className="w-6 shrink-0 text-center text-xs font-bold tabular-nums"
          style={{ color: uiScheme.mutedText }}
        >
          {minLabel}
        </span>
        <Slider
          value={value}
          onValueChange={onValueChange}
          min={min}
          max={max}
          step={step}
          className="flex-1 [&_[role=slider]]:border-2 [&_[role=slider]]:border-background [&_[role=slider]]:bg-primary [&_[role=slider]]:shadow-lg [&_[role=slider]]:transition-transform [&_[role=slider]]:active:scale-125 [&_[role=track]]:h-1.5 [&_[role=track]]:bg-muted/30 [&_[data-orientation=horizontal]_[role=range]]:bg-primary/80"
        />
        <span
          className="w-6 shrink-0 text-center text-xs font-bold tabular-nums"
          style={{ color: uiScheme.mutedText }}
        >
          {maxLabel}
        </span>
      </div>
    </div>
  );
}

function ReaderPreview({
  theme,
}: {
  theme: ReaderTheme;
}) {
  const preset = PRESET_STYLES[theme.preset];
  const fontStack = FONT_FAMILY_OPTIONS[theme.fontFamily].stack;

  return (
    <section
      className="mb-4 overflow-hidden rounded-[1.15rem] border p-4"
      aria-label="阅读效果预览"
      style={{
        background: preset.bg,
        color: preset.fg,
        borderColor: withOpacity(preset.fg, 0.1),
        boxShadow: `inset 0 1px 0 ${withOpacity(preset.fg, 0.06)}`,
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: withOpacity(preset.fg, 0.48) }}
        >
          Preview
        </span>
        <span
          className="rounded-md px-2 py-0.5 text-[10px] font-bold tabular-nums"
          style={{
            background: withOpacity(preset.fg, 0.08),
            color: withOpacity(preset.fg, 0.58),
          }}
        >
          {theme.fontSize}px · {theme.lineHeight.toFixed(2)}
        </span>
      </div>
      <div
        className="space-y-3"
        style={{
          fontFamily: fontStack,
          fontSize: `${Math.min(Math.max(theme.fontSize, 14), 22)}px`,
          lineHeight: theme.lineHeight,
          paddingInline: `${Math.min(theme.pagePaddingX, 28)}px`,
          paddingBlock: `${Math.min(theme.pagePaddingY, 24)}px`,
        }}
      >
        <p className="font-semibold">文字应该安静地留在页面里。</p>
        <p
          style={{
            color: withOpacity(preset.fg, 0.76),
            marginBlock: `${Math.min(theme.paragraphSpacing, 1.8)}em 0`,
          }}
        >
          调整字号、行距与字体时，先在这里感受一小段阅读节奏，再回到正文继续。
        </p>
      </div>
    </section>
  );
}

export function ThemeSettings({
  theme,
  setTheme,
  uiScheme,
  open,
  onOpenChange,
  overlayContainer,
  triggerClassName,
  triggerStyle,
  trigger,
}: ThemeSettingsProps) {
  const resetFeedbackTimeoutRef = useRef<number | null>(null);
  const [isResetFeedbackVisible, setIsResetFeedbackVisible] = useState(false);
  const [resetFeedbackCount, setResetFeedbackCount] = useState(0);
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const surface = getModernReaderSurface(uiScheme);
  useEffect(() => {
    return () => {
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
    };
  }, []);

  function handleResetTheme() {
    setIsResetFeedbackVisible(true);
    setResetFeedbackCount((count) => count + 1);
    if (resetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(resetFeedbackTimeoutRef.current);
    }
    resetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setIsResetFeedbackVisible(false);
      resetFeedbackTimeoutRef.current = null;
    }, 480);
    setTheme(DEFAULT_READER_THEME);
  }

  const isDefaultTheme = (
    Object.keys(DEFAULT_READER_THEME) as Array<keyof ReaderTheme>
  ).every((key) => theme[key] === DEFAULT_READER_THEME[key]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            title="阅读设置"
            className={triggerClassName}
            style={triggerStyle}
          />
        }
      >
        {trigger || <Settings className="h-4 w-4" />}
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        finalFocus={false}
        container={overlayContainer}
        className="app-sheet-shell reader-bottom-sheet-centered mx-auto bottom-[max(env(safe-area-inset-bottom,0px),0.75rem)] left-3 right-3 flex max-h-[min(88svh,40rem)] flex-col overflow-hidden rounded-[1.5rem] p-0 sm:bottom-10 sm:left-1/2 sm:right-auto sm:w-[460px] sm:max-w-[calc(100vw-2rem)] data-[side=bottom]:sm:max-h-[min(78svh,38rem)] sm:-translate-x-1/2 sm:rounded-[1.65rem]"
        style={{
          background: surface.bg,
          borderColor: surface.border,
          color: surface.fg,
          boxShadow: surface.shadow,
          backdropFilter: "blur(18px)",
        }}
      >
        <div className="flex justify-center pb-1 pt-2.5">
          <div
            className="h-1 w-9 rounded-full"
            style={{ background: surface.hairline }}
          />
        </div>
        <SheetHeader
          className="app-sheet-header shrink-0 px-5 pb-3 pt-2 sm:px-6"
          style={{
            background: "transparent",
            borderBottom: `1px solid ${surface.hairline}`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: surface.surfaceSoft,
                    color: surface.fg,
                  }}
                >
                  <Settings className="h-4 w-4" />
                </div>
                <SheetTitle
                  className="text-lg font-semibold tracking-tight"
                  style={{ color: surface.fg }}
                >
                  阅读偏好
                </SheetTitle>
              </div>
              <SheetDescription
                className="mt-1 pl-10 text-xs leading-5"
                style={{ color: surface.muted }}
              >
                营造最舒适的数字阅读环境
              </SheetDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleResetTheme}
                disabled={isDefaultTheme}
                title="重置阅读偏好"
                aria-label="重置阅读偏好"
                className={cn(
                  "h-10 w-10 rounded-full border-0 transition-[transform,box-shadow,background-color,color] hover:brightness-[0.985] disabled:opacity-45",
                  isResetFeedbackVisible && "scale-[1.08]",
                )}
                style={{
                  color: isDefaultTheme
                    ? surface.muted
                    : withOpacity(uiScheme.fg, 0.68),
                  background: surface.surfaceSoft,
                  boxShadow: isResetFeedbackVisible
                    ? `0 0 0 4px ${withOpacity(uiScheme.link, 0.1)}`
                    : "none",
                }}
              >
                <RotateCcw
                  className="h-3.5 w-3.5 transition-transform duration-500 ease-out"
                  style={{
                    transform: `rotate(${resetFeedbackCount * 360}deg)`,
                  }}
                />
              </Button>
              <button
                type="button"
                onClick={() => onOpenChange?.(false)}
                className="touch-target flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                style={{
                  color: surface.muted,
                  background: surface.surfaceSoft,
                }}
                aria-label="关闭阅读偏好"
                title="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </SheetHeader>

        <div className="app-sheet-body min-h-0 px-3 pb-3 pt-2.5 sm:px-4">
          <div
            className="mb-4 grid grid-cols-3 gap-1 rounded-2xl p-1"
            role="tablist"
            aria-label="阅读设置分类"
            style={{
              background: surface.surfaceSoft,
            }}
          >
            {SETTINGS_SECTIONS.map((section) => {
              const active = activeSection === section.id;

              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveSection(section.id)}
                  className="touch-control h-11 rounded-[0.85rem] text-[13px] font-semibold transition-[background-color,color,transform] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 sm:h-9 sm:text-xs"
                  style={{
                    background: active ? surface.bg : "transparent",
                    color: active ? surface.fg : withOpacity(surface.fg, 0.72),
                  }}
                >
                  {section.label}
                </button>
              );
            })}
          </div>

          <ReaderPreview theme={theme} />

          {activeSection === "appearance" && (
            <div className="space-y-7" role="tabpanel" aria-label="外观设置">
              <SectionCard
                title="视觉基调"
                description="环境光决定了眼睛的舒适阈值。"
                uiScheme={uiScheme}
              >
                <div className="grid grid-cols-2 gap-3">
                  {PRESETS.map((preset) => {
                    const isActive = theme.preset === preset.key;

                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => setTheme({ preset: preset.key })}
                        aria-pressed={isActive}
                        className="touch-control group relative overflow-hidden rounded-[1.5rem] border p-3 text-left transition-all duration-300 cursor-pointer active:scale-[0.96]"
                        style={{
                          background: isActive
                            ? withOpacity(uiScheme.link, 0.08)
                            : withOpacity(uiScheme.cardBg, 0.2),
                          borderColor: isActive
                            ? withOpacity(uiScheme.link, 0.4)
                            : withOpacity(uiScheme.cardBorder, 0.12),
                        }}
                      >
                        <div
                          className="relative h-14 overflow-hidden rounded-[1.15rem] px-3 py-2.5 shadow-sm transition-transform group-hover:scale-[1.02]"
                          style={{
                            background: preset.bg,
                            border: `1px solid ${
                              preset.key === "dark"
                                ? "rgba(255,255,255,0.08)"
                                : "rgba(0,0,0,0.04)"
                            }`,
                          }}
                        >
                          <div className="space-y-1.5">
                            <div
                              className="h-1 rounded-full"
                              style={{ background: preset.fg, width: "70%", opacity: 0.6 }}
                            />
                            <div
                              className="h-1 rounded-full"
                              style={{ background: preset.fg, width: "85%", opacity: 0.3 }}
                            />
                            <div
                              className="h-1 rounded-full"
                              style={{ background: preset.fg, width: "50%", opacity: 0.15 }}
                            />
                          </div>

                          {isActive && (
                            <div className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                          )}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span
                            className="text-xs font-bold tracking-wide"
                            style={{ color: isActive ? uiScheme.fg : withOpacity(uiScheme.fg, 0.72) }}
                          >
                            {preset.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard
                title="阅读引擎"
                description="翻页模拟纸质，滚动契合现代习惯。"
                uiScheme={uiScheme}
              >
                <div className="flex gap-2">
                  {(["paginated", "scrolled"] as const).map((flow) => (
                    <ValuePill
                      key={flow}
                      label={flow === "paginated" ? "翻页模式" : "滚动模式"}
                      active={theme.flow === flow}
                      onClick={() => setTheme({ flow })}
                      uiScheme={uiScheme}
                    />
                  ))}
                </div>
              </SectionCard>
            </div>
          )}

          {activeSection === "layout" && (
            <SectionCard
              title="版式美学"
              description="精调每一处间隙，让文字自然呼吸。"
              uiScheme={uiScheme}
            >
              <div className="space-y-8" role="tabpanel" aria-label="排版设置">
                <div className="space-y-3">
                  <Label className="pl-1 text-xs font-bold tracking-wide text-muted-foreground/80">
                    字型选择
                  </Label>
                  <div className="grid gap-2">
                    {FONT_ORDER.map((key) => {
                      const option = FONT_FAMILY_OPTIONS[key];
                      const isActive = theme.fontFamily === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setTheme({ fontFamily: key })}
                          aria-pressed={isActive}
                          className="touch-control flex items-center justify-between rounded-[1.25rem] border p-3 text-left transition-all active:scale-[0.98]"
                          style={{
                            background: isActive ? withOpacity(uiScheme.buttonBg, 0.8) : withOpacity(uiScheme.buttonBg, 0.2),
                            borderColor: isActive ? withOpacity(uiScheme.cardBorder, 0.4) : withOpacity(uiScheme.cardBorder, 0.1),
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold" style={{ color: isActive ? uiScheme.fg : withOpacity(uiScheme.fg, 0.8) }}>
                              {option.label}
                            </p>
                            <p className="mt-0.5 text-xs font-medium" style={{ color: uiScheme.mutedText }}>
                              {option.description}
                            </p>
                          </div>
                          {isActive && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <SliderField
                  label="字号大小"
                  valueLabel={`${theme.fontSize}px`}
                  minLabel="12"
                  maxLabel="32"
                  value={[theme.fontSize]}
                  onValueChange={([value]) => setTheme({ fontSize: value })}
                  min={12}
                  max={32}
                  step={1}
                  uiScheme={uiScheme}
                />

                <SliderField
                  label="行间距"
                  valueLabel={theme.lineHeight.toFixed(2)}
                  minLabel="1.2"
                  maxLabel="2.2"
                  value={[theme.lineHeight]}
                  onValueChange={([value]) => setTheme({ lineHeight: value })}
                  min={1.2}
                  max={2.2}
                  step={0.05}
                  uiScheme={uiScheme}
                />
              </div>
            </SectionCard>
          )}

          {activeSection === "advanced" && (
            <SectionCard
              title="高级排版"
              description="微调版心与留白，适合长时间阅读时慢慢打磨。"
              uiScheme={uiScheme}
            >
              <div className="space-y-8" role="tabpanel" aria-label="高级排版设置">
                <SliderField
                  label="左右页边距"
                  valueLabel={`${theme.pagePaddingX}px`}
                  minLabel="8"
                  maxLabel="56"
                  value={[theme.pagePaddingX]}
                  onValueChange={([value]) => setTheme({ pagePaddingX: value })}
                  min={8}
                  max={56}
                  step={2}
                  uiScheme={uiScheme}
                />

                <SliderField
                  label="上下页边距"
                  valueLabel={`${theme.pagePaddingY}px`}
                  minLabel="8"
                  maxLabel="48"
                  value={[theme.pagePaddingY]}
                  onValueChange={([value]) => setTheme({ pagePaddingY: value })}
                  min={8}
                  max={48}
                  step={2}
                  uiScheme={uiScheme}
                />

                <SliderField
                  label="段落间距"
                  valueLabel={`${theme.paragraphSpacing.toFixed(2)}em`}
                  minLabel="0.6"
                  maxLabel="2.2"
                  value={[theme.paragraphSpacing]}
                  onValueChange={([value]) => setTheme({ paragraphSpacing: value })}
                  min={0.6}
                  max={2.2}
                  step={0.05}
                  uiScheme={uiScheme}
                />

                <SliderField
                  label="最大行宽"
                  valueLabel={`${theme.maxInlineSize}px`}
                  minLabel="520"
                  maxLabel="1400"
                  value={[theme.maxInlineSize]}
                  onValueChange={([value]) => setTheme({ maxInlineSize: value })}
                  min={520}
                  max={1400}
                  step={20}
                  uiScheme={uiScheme}
                />

                {/* 中文精致排版 */}
                <div className="space-y-3 pt-4 border-t border-border/10">
                  <Label className="pl-1 text-[11px] font-bold uppercase tracking-widest opacity-70" style={{ color: uiScheme.mutedText }}>
                    中文精致排版
                  </Label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <ValuePill
                      label="首行缩进"
                      active={theme.chineseIndent}
                      onClick={() => setTheme({ chineseIndent: !theme.chineseIndent })}
                      uiScheme={uiScheme}
                    />
                    <ValuePill
                      label="标点挤压"
                      active={theme.punctuationSqueeze}
                      onClick={() => setTheme({ punctuationSqueeze: !theme.punctuationSqueeze })}
                      uiScheme={uiScheme}
                    />
                  </div>
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
