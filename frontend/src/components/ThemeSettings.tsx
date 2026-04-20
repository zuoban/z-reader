"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_READER_THEME,
  FONT_FAMILY_OPTIONS,
  type ReaderTheme,
  type ThemeColors,
} from "@/hooks/useReaderTheme";
import {
  BookOpen,
  ChevronDown,
  Palette,
  ScrollText,
  Settings,
  Type,
  Zap,
  ZapOff,
  RotateCcw,
} from "lucide-react";

const FONT_ORDER: ReaderTheme["fontFamily"][] = [
  "editorial",
  "classic",
  "humanist",
];
const PRESETS = [
  {
    key: "light",
    label: "明亮",
    bg: "#FEFDF8",
    fg: "#1C1917",
  },
  {
    key: "sepia",
    label: "纸张",
    bg: "#F5F0E1",
    fg: "#3D3225",
  },
  {
    key: "green",
    label: "森林",
    bg: "#E4F0E6",
    fg: "#1E3A2A",
  },
  {
    key: "dark",
    label: "夜间",
    bg: "#0C0B09",
    fg: "#D6D3CD",
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
}

interface SectionCardProps {
  id: string;
  title: string;
  icon: ReactNode;
  summary?: ReactNode;
  isOpen: boolean;
  onToggle: (id: string) => void;
  uiScheme: ThemeColors;
  children: ReactNode;
}

interface ValuePillProps {
  uiScheme: ThemeColors;
  children: ReactNode;
  muted?: boolean;
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

function getPaddingLabel(value: number) {
  if (value <= 12) return "极窄";
  if (value <= 20) return "紧凑";
  if (value <= 32) return "标准";
  if (value <= 48) return "舒展";
  return "宽松";
}

function getSpacingLabel(value: number) {
  if (value <= 0.9) return "紧凑";
  if (value <= 1.1) return "标准";
  if (value <= 1.4) return "舒展";
  return "宽松";
}

function getFlowLabel(flow: ReaderTheme["flow"]) {
  return flow === "paginated" ? "翻页" : "滚动";
}

function SectionCard({
  id,
  title,
  icon,
  summary,
  isOpen,
  onToggle,
  uiScheme,
  children,
}: SectionCardProps) {
  return (
    <section
      className="overflow-hidden rounded-lg border transition-colors duration-200"
      style={{
        background: uiScheme.cardBg,
        borderColor: isOpen ? `${uiScheme.link}30` : `${uiScheme.cardBorder}30`,
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between gap-3 p-3.5 text-left transition-colors duration-200 cursor-pointer"
        style={{
          background: isOpen ? `${uiScheme.buttonBg}18` : "transparent",
        }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors duration-200"
            style={{
              color: isOpen ? uiScheme.link : uiScheme.mutedText,
              background: isOpen ? `${uiScheme.link}10` : `${uiScheme.cardBorder}10`,
            }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3
              className="font-heading text-sm font-semibold"
              style={{ color: uiScheme.fg }}
            >
              {title}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {summary && (
            <div className="hidden min-[380px]:block">
              <ValuePill uiScheme={uiScheme} muted={!isOpen}>
                {summary}
              </ValuePill>
            </div>
          )}
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md transition-transform duration-200"
            style={{
              color: isOpen ? uiScheme.link : uiScheme.mutedText,
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        </div>
      </button>

      {isOpen && (
        <div
          className="px-3.5 pb-3.5 pt-1 space-y-3"
          style={{
            borderTop: `1px solid ${uiScheme.cardBorder}18`,
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

function ValuePill({ uiScheme, children, muted = false }: ValuePillProps) {
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{
        color: muted ? uiScheme.mutedText : uiScheme.link,
        background: muted ? `${uiScheme.cardBorder}10` : `${uiScheme.link}10`,
      }}
    >
      {children}
    </span>
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
    <div
      className="rounded-lg border p-3"
      style={{
        background: `${uiScheme.buttonBg}70`,
        borderColor: `${uiScheme.cardBorder}28`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label className="text-xs font-medium" style={{ color: uiScheme.fg }}>
            {label}
          </Label>
        </div>
        <ValuePill uiScheme={uiScheme}>{valueLabel}</ValuePill>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs tabular-nums shrink-0 w-5 text-right" style={{ color: uiScheme.mutedText }}>
          {minLabel}
        </span>
        <Slider
          value={value}
          onValueChange={onValueChange}
          min={min}
          max={max}
          step={step}
          className="flex-1 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary/60 [&_[role=slider]]:bg-background [&_[role=slider]]:transition-all [&_[role=slider]]:duration-200 [&_[role=slider]]:focus-visible:ring-2 [&_[role=slider]]:focus-visible:ring-primary/40"
        />
        <span className="text-xs tabular-nums shrink-0 w-5" style={{ color: uiScheme.mutedText }}>
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
}: ThemeSettingsProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    theme: true,
    typography: true,
    layout: false,
    motion: false,
  });
  const panelStyle = {
    background: uiScheme.cardBg,
    borderColor: `${uiScheme.cardBorder}40`,
    color: uiScheme.fg,
    boxShadow: `0 24px 60px ${uiScheme.cardBorder}22`,
  } as const;

  const triggerClassName =
    "h-7 w-7 rounded-full border transition-all duration-200 hover:opacity-100 active:scale-95 cursor-pointer";
  const triggerStyle = {
    color: open ? uiScheme.link : uiScheme.buttonText,
    background: "transparent",
    border: `1px solid ${open ? `${uiScheme.link}2e` : "transparent"}`,
    boxShadow: open
      ? `0 8px 18px -20px ${uiScheme.link}2e`
      : "none",
    backdropFilter: "none",
    opacity: open ? 1 : 0.84,
  } as const;

  const selectStyle = {
    color: uiScheme.fg,
    borderColor: `${uiScheme.cardBorder}35`,
    background: `${uiScheme.buttonBg}90`,
  } as const;
  const currentPreset = PRESETS.find((preset) => preset.key === theme.preset) ?? PRESETS[0];

  function toggleSection(sectionId: string) {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  function handleResetTheme() {
    setTheme(DEFAULT_READER_THEME);
  }

  const isDefaultTheme = (
    Object.keys(DEFAULT_READER_THEME) as Array<keyof ReaderTheme>
  ).every((key) => theme[key] === DEFAULT_READER_THEME[key]);

  const gapLabel =
    theme.gap === 0
      ? "无"
      : theme.gap <= 3
        ? "紧凑"
        : theme.gap <= 5
          ? "标准"
          : theme.gap <= 7
            ? "舒展"
            : "宽敞";

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
        <Settings className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton
        finalFocus={false}
        container={overlayContainer}
        className="max-w-[420px] p-0 sm:w-[420px] sm:max-w-[420px]"
        style={panelStyle}
      >
        <SheetHeader
          className="sm:pl-5 sm:pr-16"
          style={{ borderColor: `${uiScheme.cardBorder}30` }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle
                className="font-heading text-base font-semibold"
                style={{ color: uiScheme.fg }}
              >
                阅读偏好
              </SheetTitle>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetTheme}
                disabled={isDefaultTheme}
                title={isDefaultTheme ? "已是默认样式" : "恢复默认阅读样式"}
                className="h-8 gap-1.5 rounded-md border bg-transparent! px-2.5 text-xs font-medium shadow-none transition-colors hover:bg-transparent! active:bg-transparent! aria-expanded:bg-transparent! focus-visible:border-transparent! focus-visible:ring-0! disabled:cursor-default disabled:opacity-45"
                style={{
                  color: uiScheme.buttonText,
                  background: "transparent",
                  borderColor: "transparent",
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重置默认
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="max-h-[calc(100vh-73px)] space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          <section
            className="overflow-hidden rounded-lg border"
            style={{
              background: uiScheme.cardBg,
              borderColor: `${uiScheme.cardBorder}30`,
            }}
          >
            <div
              className="flex items-center justify-between gap-2.5 px-3.5 py-2.5"
              style={{ borderBottom: `1px solid ${uiScheme.cardBorder}15` }}
            >
              <span
                className="text-xs font-medium"
                style={{ color: uiScheme.accentText }}
              >
                预览
              </span>
              <ValuePill uiScheme={uiScheme}>
                {currentPreset.label} · {FONT_FAMILY_OPTIONS[theme.fontFamily].label}
              </ValuePill>
            </div>
            <div
              className="p-4"
              style={{
                background: currentPreset.bg,
              }}
            >
              <div>
                <h3
                  className="text-sm font-semibold leading-snug"
                  style={{
                    fontFamily: FONT_FAMILY_OPTIONS[theme.fontFamily].stack,
                    color: currentPreset.fg,
                  }}
                >
                  文字的节奏，<br />会决定阅读的呼吸感。
                </h3>
                <p
                  className="mt-2 leading-relaxed opacity-75"
                  style={{
                    fontFamily: FONT_FAMILY_OPTIONS[theme.fontFamily].stack,
                    fontSize: `${Math.max(theme.fontSize - 2, 12)}px`,
                    lineHeight: theme.lineHeight,
                    color: currentPreset.fg,
                  }}
                >
                  调整主题、字体和版式后，这里会同步呈现当前阅读效果。
                </p>
              </div>
            </div>
          </section>

          <SectionCard
            id="theme"
            title="阅读主题"
            icon={<Palette className="h-4 w-4" />}
            summary={currentPreset.label}
            isOpen={openSections.theme}
            onToggle={toggleSection}
            uiScheme={uiScheme}
          >
            <div className="grid grid-cols-2 gap-2.5">
              {PRESETS.map((preset) => {
                const isActive = theme.preset === preset.key;

                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => setTheme({ preset: preset.key })}
                    className="group text-left transition-colors duration-200 cursor-pointer rounded-lg border p-2.5"
                    style={{
                      background: isActive ? `${uiScheme.link}0c` : uiScheme.buttonBg,
                      borderColor: isActive ? `${uiScheme.link}40` : `${uiScheme.cardBorder}25`,
                    }}
                  >
                    <div
                      className="h-12 rounded-md px-2.5 py-2"
                      style={{
                        background: preset.bg,
                        border: `1px solid ${preset.key === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"}`,
                      }}
                    >
                      <div className="h-1.5 rounded-sm mb-1" style={{ background: preset.fg, width: "60%", opacity: 0.7 }} />
                      <div className="h-1.5 rounded-sm mb-1" style={{ background: preset.fg, width: "85%", opacity: 0.5 }} />
                      <div className="h-1.5 rounded-sm" style={{ background: preset.fg, width: "45%", opacity: 0.35 }} />
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between">
                        <span
                          className="text-xs font-medium"
                          style={{ color: isActive ? uiScheme.link : uiScheme.fg }}
                        >
                          {preset.label}
                        </span>
                        {isActive && (
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: uiScheme.link }}
                          />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            id="typography"
            title="字体与节奏"
            icon={<Type className="h-4 w-4" />}
            summary={`${FONT_FAMILY_OPTIONS[theme.fontFamily].label} · ${theme.fontSize}px`}
            isOpen={openSections.typography}
            onToggle={toggleSection}
            uiScheme={uiScheme}
          >
            <div
              className="rounded-lg border p-3"
              style={{
                background: `${uiScheme.buttonBg}70`,
                borderColor: `${uiScheme.cardBorder}28`,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Label className="text-xs font-medium" style={{ color: uiScheme.fg }}>
                    正文字体
                  </Label>
                </div>
                <ValuePill uiScheme={uiScheme}>
                  {FONT_FAMILY_OPTIONS[theme.fontFamily].label}
                </ValuePill>
              </div>
              <Select
                value={theme.fontFamily}
                onValueChange={(value) =>
                  setTheme({ fontFamily: value as ReaderTheme["fontFamily"] })
                }
              >
                <SelectTrigger
                  className="mt-3 h-10 rounded-md border px-3 text-sm shadow-none"
                  style={selectStyle}
                >
                  <SelectValue placeholder="选择字体" />
                </SelectTrigger>
                <SelectContent container={overlayContainer}>
                  {FONT_ORDER.map((key) => (
                    <SelectItem key={key} value={key}>
                      {FONT_FAMILY_OPTIONS[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div
                className="mt-3 rounded-md border px-3 py-2.5"
                style={{
                  background: `${uiScheme.cardBorder}08`,
                  borderColor: `${uiScheme.cardBorder}18`,
                }}
              >
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    fontFamily: FONT_FAMILY_OPTIONS[theme.fontFamily].stack,
                    color: uiScheme.fg,
                  }}
                >
                  这是当前字体在阅读面板中的呈现效果。
                </p>
              </div>
            </div>

            <SliderField
              label="字体大小"
              valueLabel={`${theme.fontSize}px`}
              minLabel="12"
              maxLabel="28"
              value={[theme.fontSize]}
              onValueChange={([value]) => setTheme({ fontSize: value })}
              min={12}
              max={28}
              step={1}
              uiScheme={uiScheme}
            />

            <SliderField
              label="行高"
              valueLabel={theme.lineHeight.toFixed(1)}
              minLabel="1.4"
              maxLabel="2.0"
              value={[theme.lineHeight]}
              onValueChange={([value]) => setTheme({ lineHeight: value })}
              min={1.4}
              max={2.0}
              step={0.1}
              uiScheme={uiScheme}
            />

            <SliderField
              label="段落间距"
              valueLabel={`${theme.paragraphSpacing.toFixed(1)}em · ${getSpacingLabel(theme.paragraphSpacing)}`}
              minLabel="0.8"
              maxLabel="2.0"
              value={[theme.paragraphSpacing]}
              onValueChange={([value]) => setTheme({ paragraphSpacing: value })}
              min={0.8}
              max={2.0}
              step={0.1}
              uiScheme={uiScheme}
            />
          </SectionCard>

          <SectionCard
            id="layout"
            title="版式布局"
            icon={<BookOpen className="h-4 w-4" />}
            summary={`${getFlowLabel(theme.flow)} · ${theme.maxInlineSize}px · ${gapLabel}`}
            isOpen={openSections.layout}
            onToggle={toggleSection}
            uiScheme={uiScheme}
          >
            <div
              className="rounded-lg border p-3"
              style={{
                background: `${uiScheme.buttonBg}70`,
                borderColor: `${uiScheme.cardBorder}28`,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Label className="text-xs font-medium" style={{ color: uiScheme.fg }}>
                    阅读模式
                  </Label>
                </div>
                <ValuePill uiScheme={uiScheme}>{getFlowLabel(theme.flow)}</ValuePill>
              </div>

              <div
                className="mt-3 grid grid-cols-2 gap-2"
                style={{ background: `${uiScheme.cardBorder}10`, borderColor: `${uiScheme.cardBorder}20` }}
              >
                {(["paginated", "scrolled"] as const).map((flow) => {
                  const isActive = theme.flow === flow;

                  return (
                    <button
                      key={flow}
                      type="button"
                      onClick={() => setTheme({ flow })}
                      className="flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors duration-200 cursor-pointer"
                      style={{
                        color: isActive ? uiScheme.link : uiScheme.mutedText,
                        background: isActive ? `${uiScheme.link}0e` : "transparent",
                        border: `1px solid ${isActive ? `${uiScheme.link}30` : "transparent"}`,
                      }}
                    >
                      {flow === "paginated" ? (
                        <BookOpen className="h-4 w-4 shrink-0" />
                      ) : (
                        <ScrollText className="h-4 w-4 shrink-0" />
                      )}
                      <div>
                        <span className="text-xs font-semibold block tracking-wide">
                          {flow === "paginated" ? "翻页" : "滚动"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <SliderField
              label="上下边距"
              valueLabel={`${theme.pagePaddingY}px · ${getPaddingLabel(theme.pagePaddingY)}`}
              minLabel="0"
              maxLabel="64"
              value={[theme.pagePaddingY]}
              onValueChange={([value]) => setTheme({ pagePaddingY: value })}
              min={0}
              max={64}
              step={4}
              uiScheme={uiScheme}
            />

            <SliderField
              label="左右边距"
              valueLabel={`${theme.pagePaddingX}px · ${getPaddingLabel(theme.pagePaddingX)}`}
              minLabel="0"
              maxLabel="72"
              value={[theme.pagePaddingX]}
              onValueChange={([value]) => setTheme({ pagePaddingX: value })}
              min={0}
              max={72}
              step={4}
              uiScheme={uiScheme}
            />

            <SliderField
              label="版心宽度"
              valueLabel={`${theme.maxInlineSize}px`}
              minLabel="紧凑"
              maxLabel="铺满"
              value={[theme.maxInlineSize]}
              onValueChange={([value]) => setTheme({ maxInlineSize: value })}
              min={760}
              max={1440}
              step={80}
              uiScheme={uiScheme}
            />

            <SliderField
              label="页间距"
              valueLabel={gapLabel}
              minLabel="无"
              maxLabel="宽敞"
              value={[theme.gap]}
              onValueChange={([value]) => setTheme({ gap: value })}
              min={0}
              max={10}
              step={1}
              uiScheme={uiScheme}
            />
          </SectionCard>

          <SectionCard
            id="motion"
            title="动态效果"
            icon={theme.animated ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
            summary={theme.animated ? "已开启" : "已关闭"}
            isOpen={openSections.motion}
            onToggle={toggleSection}
            uiScheme={uiScheme}
          >
            <div
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
              style={{
                background: `${uiScheme.buttonBg}70`,
                borderColor: `${uiScheme.cardBorder}28`,
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <Label className="text-xs font-medium" style={{ color: uiScheme.fg }}>
                    翻页动画
                  </Label>
                  <ValuePill uiScheme={uiScheme} muted={!theme.animated}>
                    {theme.animated ? "已开启" : "已关闭"}
                  </ValuePill>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTheme({ animated: !theme.animated })}
                className="relative shrink-0 rounded-full transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                style={{
                  width: "50px",
                  height: "28px",
                  minWidth: "50px",
                  minHeight: "28px",
                  backgroundColor: theme.animated
                    ? uiScheme.link
                    : `${uiScheme.cardBorder}50`,
                }}
                aria-checked={theme.animated}
                role="switch"
                aria-label="翻页动画开关"
              >
                <span
                  className="absolute top-1 rounded-full bg-white transition-all duration-300"
                  style={{
                    left: theme.animated ? "25px" : "4px",
                    width: "20px",
                    height: "20px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
                  }}
                />
              </button>
            </div>
          </SectionCard>
        </div>
      </SheetContent>
    </Sheet>
  );
}
