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
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_READER_THEME,
  FONT_FAMILY_OPTIONS,
  PRESET_STYLES,
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
  triggerStyle?: React.CSSProperties;
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
      className="overflow-hidden rounded-2xl transition-all duration-300"
      style={{
        background: isOpen ? withOpacity(uiScheme.cardBg, 0.6) : "transparent",
        border: `1px solid ${isOpen ? withOpacity(uiScheme.cardBorder, 0.3) : "transparent"}`,
        boxShadow: isOpen ? `0 8px 32px ${withOpacity(uiScheme.cardBorder, 0.1)}` : "none",
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors duration-200 cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200"
            style={{
              color: isOpen ? uiScheme.link : uiScheme.mutedText,
              background: isOpen ? withOpacity(uiScheme.link, 0.1) : withOpacity(uiScheme.cardBorder, 0.15),
            }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3
              className="font-heading text-sm font-semibold"
              style={{ color: isOpen ? uiScheme.fg : uiScheme.mutedText }}
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
            className="flex h-7 w-7 items-center justify-center rounded-full transition-transform duration-200"
            style={{
              color: isOpen ? uiScheme.link : uiScheme.mutedText,
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              background: isOpen ? withOpacity(uiScheme.link, 0.05) : "transparent",
            }}
          >
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </button>

      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-5 pt-2 space-y-5">
            <div className="w-full h-px mb-2" style={{ background: withOpacity(uiScheme.cardBorder, 0.2) }} />
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function ValuePill({ uiScheme, children, muted = false }: ValuePillProps) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap tracking-wide transition-colors"
      style={{
        color: muted ? uiScheme.mutedText : uiScheme.link,
        background: muted ? withOpacity(uiScheme.cardBorder, 0.15) : withOpacity(uiScheme.link, 0.1),
        border: `1px solid ${muted ? withOpacity(uiScheme.cardBorder, 0.2) : withOpacity(uiScheme.link, 0.15)}`,
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
    <div className="py-1">
      <div className="flex items-center justify-between gap-3 mb-3">
        <Label className="text-xs font-semibold tracking-wide" style={{ color: uiScheme.fg, opacity: 0.8 }}>
          {label}
        </Label>
        <span className="text-xs font-semibold tabular-nums" style={{ color: uiScheme.link }}>{valueLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] tabular-nums shrink-0 w-6 text-right font-medium" style={{ color: uiScheme.mutedText }}>
          {minLabel}
        </span>
        <Slider
          value={value}
          onValueChange={onValueChange}
          min={min}
          max={max}
          step={step}
          className="flex-1 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary/60 [&_[role=slider]]:bg-background [&_[role=slider]]:transition-all [&_[role=slider]]:duration-200 [&_[role=slider]]:focus-visible:ring-2 [&_[role=slider]]:focus-visible:ring-primary/40 [&_[role=track]]:h-1.5"
        />
        <span className="text-[11px] tabular-nums shrink-0 w-6 font-medium" style={{ color: uiScheme.mutedText }}>
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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    theme: true,
    typography: true,
    layout: false,
    motion: false,
  });
  const panelStyle = {
    background: withOpacity(uiScheme.cardBg, 0.75),
    backdropFilter: "blur(32px) saturate(180%)",
    WebkitBackdropFilter: "blur(32px) saturate(180%)",
    borderLeft: `1px solid ${withOpacity(uiScheme.cardBorder, 0.3)}`,
    color: uiScheme.fg,
    boxShadow: `-12px 0 40px ${withOpacity(uiScheme.cardBorder, 0.15)}`,
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
        <Settings className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton
        finalFocus={false}
        container={overlayContainer}
        className="max-w-[420px] p-0 sm:w-[420px] sm:max-w-[420px] border-l-0 flex flex-col"
        style={panelStyle}
      >
        <SheetHeader
          className="px-6 pb-5 pt-8"
          style={{ borderBottom: `1px solid ${withOpacity(uiScheme.cardBorder, 0.2)}` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: withOpacity(uiScheme.link, 0.12),
                  color: uiScheme.link,
                }}
              >
                <Settings className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <SheetTitle
                  className="font-heading text-lg font-semibold"
                  style={{ color: uiScheme.fg }}
                >
                  阅读偏好
                </SheetTitle>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetTheme}
                disabled={isDefaultTheme}
                title={isDefaultTheme ? "已是默认样式" : "恢复默认阅读样式"}
                className="h-8 gap-1.5 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-40"
                style={{
                  color: uiScheme.buttonText,
                  background: withOpacity(uiScheme.cardBorder, 0.15),
                  border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.2)}`,
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重置
              </Button>
            </div>
          </div>
          
          <SheetDescription
            className="mt-3 text-sm leading-relaxed"
            style={{ color: uiScheme.mutedText }}
          >
            即时调整主题、版式与动效，找到更舒服的阅读节奏。
          </SheetDescription>
          
          <div className="mt-5 flex flex-wrap gap-2">
            <ValuePill uiScheme={uiScheme}>{currentPreset.label}</ValuePill>
            <ValuePill uiScheme={uiScheme} muted>
              {FONT_FAMILY_OPTIONS[theme.fontFamily].label}
            </ValuePill>
            <ValuePill uiScheme={uiScheme} muted>
              {getFlowLabel(theme.flow)}
            </ValuePill>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-8 pt-6 sm:px-6">


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
                    className="group text-left transition-all duration-300 cursor-pointer rounded-xl p-2.5"
                    style={{
                      background: isActive ? withOpacity(uiScheme.link, 0.08) : "transparent",
                      border: `1px solid ${isActive ? withOpacity(uiScheme.link, 0.3) : withOpacity(uiScheme.cardBorder, 0.3)}`,
                      boxShadow: isActive ? `0 8px 24px -8px ${withOpacity(uiScheme.link, 0.2)}` : "none",
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
              className="rounded-xl p-3.5 mb-4"
              style={{
                background: withOpacity(uiScheme.buttonBg, 0.4),
                border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.2)}`,
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
                className="mt-3 rounded-lg px-3 py-2.5"
                style={{
                  background: withOpacity(uiScheme.cardBorder, 0.1),
                  border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.15)}`,
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
              className="rounded-xl p-3.5 mb-4"
              style={{
                background: withOpacity(uiScheme.buttonBg, 0.4),
                border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.2)}`,
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
                className="mt-3 grid grid-cols-2 gap-2 rounded-lg p-1.5"
                style={{
                  background: withOpacity(uiScheme.cardBorder, 0.1),
                  border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.15)}`,
                }}
              >
                {(["paginated", "scrolled"] as const).map((flow) => {
                  const isActive = theme.flow === flow;

                  return (
                    <button
                      key={flow}
                      type="button"
                      onClick={() => setTheme({ flow })}
                      className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors duration-200 cursor-pointer"
                      style={{
                        color: isActive ? uiScheme.link : uiScheme.mutedText,
                        background: isActive ? withOpacity(uiScheme.link, 0.1) : "transparent",
                        border: `1px solid ${isActive ? withOpacity(uiScheme.link, 0.2) : "transparent"}`,
                        boxShadow: isActive ? `0 2px 8px ${withOpacity(uiScheme.link, 0.1)}` : "none",
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
              className="flex items-center justify-between gap-3 rounded-xl p-3.5"
              style={{
                background: withOpacity(uiScheme.buttonBg, 0.4),
                border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.2)}`,
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

function withOpacity(color: string, opacity: number) {
  if (!color.startsWith("#")) return color;

  const normalized =
    color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;

  const hexOpacity = Math.round(Math.min(Math.max(opacity, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");

  return `${normalized}${hexOpacity}`;
}
