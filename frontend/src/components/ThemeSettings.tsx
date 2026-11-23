"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";

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
import { Check, ChevronDown, ChevronUp, RotateCcw, Settings, X } from "lucide-react";

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

function SettingChoice({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="reader-settings-option flex min-h-11 flex-1 items-center justify-center border px-2 text-sm"
      style={{ borderColor: active ? "var(--reader-option-accent)" : "var(--reader-option-rule)" }}
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
      <div className="flex items-center justify-between gap-3 px-0.5">
        <Label className="text-sm font-medium" style={{ color: uiScheme.fg }}>
          {label}
        </Label>
        <span className="text-xs font-medium tabular-nums text-[var(--reader-option-accent)]">
          {valueLabel}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className="w-8 shrink-0 text-center text-xs tabular-nums"
          style={{ color: uiScheme.mutedText }}
        >
          {minLabel}
        </span>
        <Slider value={value} onValueChange={onValueChange} min={min} max={max} step={step} className="flex-1" />
        <span
          className="w-8 shrink-0 text-center text-xs tabular-nums"
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
  const passageId = useId();
  const [expanded, setExpanded] = useState(true);

  return (
    <section
      className="mb-5 rounded-lg border px-4"
      aria-label="阅读效果预览"
      style={{
        background: preset.bg,
        color: preset.fg,
        borderColor: withOpacity(preset.fg, 0.12),
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2">
        <span
          className="text-xs font-medium"
          style={{ color: withOpacity(preset.fg, 0.72) }}
        >
          阅读预览
        </span>
        <span
          className="mr-auto text-xs tabular-nums"
          style={{
            color: withOpacity(preset.fg, 0.78),
          }}
        >
          {theme.fontSize}px · {theme.lineHeight.toFixed(2)}
        </span>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={passageId}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          style={{ color: withOpacity(preset.fg, 0.8) }}
        >
          {expanded ? "收起预览" : "展开预览"}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p
        id={passageId}
        hidden={!expanded}
        className="pb-3 [overflow-wrap:anywhere]"
        style={{
          fontFamily: fontStack,
          fontSize: `${theme.fontSize}px`,
          lineHeight: theme.lineHeight,
          fontWeight: 400,
          textIndent: theme.chineseIndent ? "2em" : undefined,
          fontVariantEastAsian: theme.punctuationSqueeze ? "proportional-width" : undefined,
        }}
      >
        文字应该安静地留在页面里。
      </p>
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
        className="reader-panel border p-0 sm:w-[480px] sm:max-w-[calc(100vw-2rem)]"
        style={{
          background: uiScheme.cardBg,
          borderColor: surface.border,
          color: surface.fg,
        }}
      >
        <SheetHeader
          className="shrink-0 bg-transparent px-4 py-3 sm:px-6"
          style={{ borderColor: surface.hairline }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-xl font-medium" style={{ color: surface.fg }}>
                阅读偏好
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs" style={{ color: surface.muted }}>
                调整纸色、字号与版式细节
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
                  "size-11 rounded-lg border-0 transition-colors hover:bg-secondary disabled:opacity-45 lg:size-9",
                  isResetFeedbackVisible && "scale-[1.04]",
                )}
                style={{
                  color: isDefaultTheme
                    ? surface.muted
                    : withOpacity(uiScheme.fg, 0.72),
                }}
              >
                <RotateCcw
                  className="h-3.5 w-3.5 transition-transform duration-300 ease-out"
                  style={{
                    transform: `rotate(${resetFeedbackCount * 360}deg)`,
                  }}
                />
              </Button>
              <button
                type="button"
                onClick={() => onOpenChange?.(false)}
                className="flex size-11 items-center justify-center rounded-lg lg:size-9 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                style={{
                  color: surface.muted,
                }}
                aria-label="关闭阅读偏好"
                title="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </SheetHeader>

        <div
          className="grid shrink-0 grid-cols-3 px-4 sm:px-6"
          role="tablist"
          aria-label="阅读设置分类"
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
                className="min-h-11 border-b text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2"
                style={{
                  borderColor: active ? uiScheme.link : surface.hairline,
                  color: active ? uiScheme.link : surface.muted,
                }}
              >
                {section.label}
              </button>
            );
          })}
        </div>

        <div
          className="reader-panel-body custom-scrollbar px-4 pb-5 pt-4 sm:px-6"
          style={{
            "--reader-option-selected": withOpacity(uiScheme.link, 0.09),
            "--reader-option-accent": uiScheme.link,
            "--reader-option-rule": surface.hairline,
          } as CSSProperties}
        >
          <ReaderPreview theme={theme} />

          {activeSection === "appearance" && (
            <div className="space-y-5" role="tabpanel" aria-label="外观设置">
              <section className="space-y-2.5">
                <h3 className="text-sm font-medium">纸面色调</h3>
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                  {PRESETS.map((preset) => {
                    const isActive = theme.preset === preset.key;

                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => setTheme({ preset: preset.key })}
                        aria-pressed={isActive}
                        className="reader-settings-option grid min-h-11 min-w-0 justify-items-center gap-1 border p-1 text-xs sm:p-1.5"
                        style={{ borderColor: isActive ? uiScheme.link : surface.hairline }}
                      >
                        <span
                          aria-hidden="true"
                          className="relative grid h-9 w-full place-items-center rounded-sm border font-heading text-lg"
                          style={{
                            background: preset.bg,
                            color: preset.fg,
                            borderColor: withOpacity(preset.fg, 0.16),
                          }}
                        >
                          文
                          {isActive && <Check className="absolute right-0.5 top-0.5 size-3" />}
                        </span>
                        <span className={isActive ? "font-semibold" : undefined}>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2.5 border-t pt-4" style={{ borderColor: surface.hairline }}>
                <h3 className="text-sm font-medium">阅读方式</h3>
                <div className="flex gap-2">
                  {(["paginated", "scrolled"] as const).map((flow) => (
                    <SettingChoice
                      key={flow}
                      label={flow === "paginated" ? "翻页模式" : "滚动模式"}
                      active={theme.flow === flow}
                      onClick={() => setTheme({ flow })}
                    />
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeSection === "layout" && (
            <div className="space-y-5" role="tabpanel" aria-label="排版设置">
              <section className="space-y-2">
                <h3 className="text-sm font-medium">字型选择</h3>
                <div className="divide-y divide-[var(--reader-option-rule)] border-y border-[var(--reader-option-rule)]">
                  {FONT_ORDER.map((key) => {
                    const option = FONT_FAMILY_OPTIONS[key];
                    const isActive = theme.fontFamily === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTheme({ fontFamily: key })}
                        aria-pressed={isActive}
                        className="reader-settings-option flex min-h-11 w-full items-center gap-3 px-2.5 py-2 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-base" style={{ fontFamily: option.stack }}>
                            {option.label}
                          </span>
                          <span className="block text-xs" style={{ color: surface.muted }}>
                            {option.description}
                          </span>
                        </span>
                        {isActive && <Check aria-hidden="true" className="size-4 shrink-0" style={{ color: uiScheme.link }} />}
                      </button>
                    );
                  })}
                </div>
              </section>

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
          )}

          {activeSection === "advanced" && (
            <div className="space-y-5" role="tabpanel" aria-label="高级排版设置">
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

              <div className="space-y-3 border-t border-border/30 pt-4">
                <Label className="pl-0.5 text-xs font-medium" style={{ color: uiScheme.mutedText }}>
                  中文排版
                </Label>
                <div className="grid grid-cols-2 gap-2.5">
                  <SettingChoice
                    label="首行缩进"
                    active={theme.chineseIndent}
                    onClick={() => setTheme({ chineseIndent: !theme.chineseIndent })}
                  />
                  <SettingChoice
                    label="标点挤压"
                    active={theme.punctuationSqueeze}
                    onClick={() => setTheme({ punctuationSqueeze: !theme.punctuationSqueeze })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
