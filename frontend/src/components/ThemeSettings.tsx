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
  floatingSheetActionButtonClass,
  getFloatingSheetActionButtonStyle,
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
import { RotateCcw, Settings } from "lucide-react";

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

interface ThemeSettingsProps {
  theme: ReaderTheme;
  setTheme: (theme: Partial<ReaderTheme>) => void;
  uiScheme: ThemeColors;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  overlayContainer?: HTMLElement | null;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
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
      className="space-y-4 rounded-[1.75rem] border border-border/40 bg-card p-5 shadow-sm transition-all hover:bg-card"
      style={{
        borderColor: withOpacity(uiScheme.cardBorder, 0.18),
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h3
            className="text-sm font-bold tracking-tight"
            style={{ color: uiScheme.fg }}
          >
            {title}
          </h3>
          {description ? (
            <p className="text-[11px] font-medium leading-relaxed opacity-60" style={{ color: uiScheme.mutedText }}>
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
      className={cn(
        "flex-1 rounded-[1.25rem] px-3 py-2.5 text-xs font-bold transition-all active:scale-[0.96]",
        active ? "shadow-md" : "hover:bg-muted/40"
      )}
      style={{
        color: active ? uiScheme.fg : withOpacity(uiScheme.fg, 0.5),
        background: active ? withOpacity(uiScheme.buttonBg, 0.8) : withOpacity(uiScheme.buttonBg, 0.2),
        border: `1px solid ${active ? withOpacity(uiScheme.cardBorder, 0.4) : withOpacity(uiScheme.cardBorder, 0.1)}`,
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
          className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70"
        >
          {label}
        </Label>
        <span
          className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-black tabular-nums text-primary"
        >
          {valueLabel}
        </span>
      </div>
      <div className="flex items-center gap-3.5">
        <span
          className="w-6 shrink-0 text-center text-[10px] font-black tabular-nums opacity-40"
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
          className="flex-1 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-2 [&_[role=slider]]:border-background [&_[role=slider]]:bg-primary [&_[role=slider]]:shadow-lg [&_[role=slider]]:transition-transform [&_[role=slider]]:active:scale-125 [&_[role=track]]:h-1.5 [&_[role=track]]:bg-muted/30 [&_[data-orientation=horizontal]_[role=range]]:bg-primary/80"
        />
        <span
          className="w-6 shrink-0 text-center text-[10px] font-black tabular-nums opacity-40"
          style={{ color: uiScheme.mutedText }}
        >
          {maxLabel}
        </span>
      </div>
    </div>
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
}: ThemeSettingsProps) {
  const resetFeedbackTimeoutRef = useRef<number | null>(null);
  const [isResetFeedbackVisible, setIsResetFeedbackVisible] = useState(false);
  const [resetFeedbackCount, setResetFeedbackCount] = useState(0);
  const panelStyle = {
    background: uiScheme.cardBg,
    borderLeft: `1px solid ${withOpacity(uiScheme.cardBorder, 0.22)}`,
    color: uiScheme.fg,
    boxShadow: `-10px 0 28px ${withOpacity(uiScheme.cardBorder, 0.08)}`,
  } as const;
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
        side="bottom"
        showCloseButton
        finalFocus={false}
        container={overlayContainer}
        className="mx-auto flex flex-col p-0 bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 rounded-[2.5rem] border shadow-2xl sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[420px] sm:-translate-x-1/2"
        style={{
          background: uiScheme.cardBg,
          borderColor: withOpacity(uiScheme.cardBorder, 0.22),
          color: uiScheme.fg,
          boxShadow: `0 -12px 48px -12px ${withOpacity(uiScheme.cardBorder, 0.35)}`,
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleResetTheme}
          disabled={isDefaultTheme}
          title="重置阅读偏好"
          aria-label="重置阅读偏好"
          className={cn(
            floatingSheetActionButtonClass,
            isResetFeedbackVisible && "scale-[1.08]",
          )}
          style={{
            ...getFloatingSheetActionButtonStyle({
              uiScheme,
              enabled: !isDefaultTheme,
              side: "right",
              tone: "neutral",
            }),
            top: 'calc(10rem + 12px)', // Adjust top position to avoid overlapping with close button
            boxShadow: isResetFeedbackVisible
              ? `0 0 0 4px ${withOpacity(uiScheme.link, 0.12)}, 0 10px 18px -16px ${withOpacity(uiScheme.cardBorder, 0.28)}`
              : undefined,
          }}
        >
          <RotateCcw
            className="h-4 w-4 transition-transform duration-500 ease-out"
            style={{
              transform: `rotate(${resetFeedbackCount * 360}deg)`,
            }}
          />
        </Button>

        <SheetHeader className="relative overflow-hidden border-b-0 px-8 pb-4 pt-10 pr-24">
          <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-primary/10" />
          <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-accent/10" />
          
          <div className="relative min-w-0">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm shadow-primary/5">
                <Settings className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-2xl font-bold tracking-tight" style={{ color: uiScheme.fg }}>
                  阅读偏好
                </SheetTitle>
                <SheetDescription
                  className="mt-1 text-xs font-medium opacity-60"
                  style={{ color: uiScheme.mutedText }}
                >
                  营造最舒适的数字阅读环境
                </SheetDescription>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-7 overflow-y-auto px-8 pb-12 pt-4">
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
                    className="group relative overflow-hidden rounded-[1.5rem] border p-3 text-left transition-all duration-300 cursor-pointer active:scale-[0.96]"
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
                        className="text-[11px] font-bold tracking-wide"
                        style={{ color: isActive ? uiScheme.fg : withOpacity(uiScheme.fg, 0.6) }}
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

          <SectionCard
            title="版式美学"
            description="精调每一处间隙，让文字自然呼吸。"
            uiScheme={uiScheme}
          >
            <div className="space-y-8">
              <div className="space-y-3">
                <Label className="pl-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                  字型选择
                </Label>
                <div className="grid gap-2">
                  {FONT_ORDER.map((key) => {
                    const option = FONT_FAMILY_OPTIONS[key];
                    const isActive = theme.fontFamily === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setTheme({ fontFamily: key })}
                        className="flex items-center justify-between rounded-[1.25rem] border p-3 text-left transition-all active:scale-[0.98]"
                        style={{
                          background: isActive ? withOpacity(uiScheme.buttonBg, 0.8) : withOpacity(uiScheme.buttonBg, 0.2),
                          borderColor: isActive ? withOpacity(uiScheme.cardBorder, 0.4) : withOpacity(uiScheme.cardBorder, 0.1),
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold" style={{ color: isActive ? uiScheme.fg : withOpacity(uiScheme.fg, 0.8) }}>
                            {option.label}
                          </p>
                          <p className="mt-0.5 text-[10px] font-medium opacity-50" style={{ color: uiScheme.mutedText }}>
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
