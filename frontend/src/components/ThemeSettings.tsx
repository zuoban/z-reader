"use client";

import type { CSSProperties, ReactNode } from "react";

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

function getFlowLabel(flow: ReaderTheme["flow"]) {
  return flow === "paginated" ? "翻页" : "滚动";
}

function PanelSection({
  title,
  description,
  uiScheme,
  children,
}: SectionProps) {
  return (
    <section
      className="space-y-3.5 rounded-2xl border px-4 py-4"
      style={{
        background: withOpacity(uiScheme.buttonBg, 0.22),
        borderColor: withOpacity(uiScheme.cardBorder, 0.18),
      }}
    >
      <div className="space-y-1">
        <h3
          className="text-sm font-semibold tracking-tight"
          style={{ color: uiScheme.fg }}
        >
          {title}
        </h3>
        {description ? (
          <p className="text-xs leading-5" style={{ color: uiScheme.mutedText }}>
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label
          className="text-xs font-medium"
          style={{ color: withOpacity(uiScheme.fg, 0.82) }}
        >
          {label}
        </Label>
        <span
          className="text-xs tabular-nums"
          style={{ color: withOpacity(uiScheme.fg, 0.58) }}
        >
          {valueLabel}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <span
          className="w-8 shrink-0 text-right text-[11px] tabular-nums"
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
          className="flex-1 [&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5 [&_[role=slider]]:border [&_[role=slider]]:border-primary/40 [&_[role=slider]]:bg-background [&_[role=slider]]:shadow-sm [&_[role=slider]]:transition-all [&_[role=slider]]:duration-200 [&_[role=slider]]:focus-visible:ring-2 [&_[role=slider]]:focus-visible:ring-primary/30 [&_[role=track]]:h-1"
        />
        <span
          className="w-8 shrink-0 text-[11px] tabular-nums"
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
  const panelStyle = {
    background: withOpacity(uiScheme.cardBg, 0.92),
    backdropFilter: "blur(22px) saturate(150%)",
    WebkitBackdropFilter: "blur(22px) saturate(150%)",
    borderLeft: `1px solid ${withOpacity(uiScheme.cardBorder, 0.22)}`,
    color: uiScheme.fg,
    boxShadow: `-10px 0 28px ${withOpacity(uiScheme.cardBorder, 0.08)}`,
  } as const;
  const selectStyle = {
    color: uiScheme.fg,
    borderColor: withOpacity(uiScheme.cardBorder, 0.22),
    background: withOpacity(uiScheme.cardBg, 0.65),
  } as const;

  const currentPreset = PRESETS.find((preset) => preset.key === theme.preset) ?? PRESETS[0];

  function handleResetTheme() {
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
        side="right"
        showCloseButton
        finalFocus={false}
        container={overlayContainer}
        className="flex flex-col border-l-0 p-0 sm:w-[380px] sm:max-w-[380px]"
        style={panelStyle}
      >
        <SheetHeader
          className="px-5 pb-4 pt-6"
          style={{ borderBottom: `1px solid ${withOpacity(uiScheme.cardBorder, 0.14)}` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold" style={{ color: uiScheme.fg }}>
                阅读偏好
              </SheetTitle>
              <SheetDescription
                className="mt-1 text-xs leading-5"
                style={{ color: uiScheme.mutedText }}
              >
                保留最常用的设置，减少调节干扰。
              </SheetDescription>
              <p
                className="mt-2 text-xs"
                style={{ color: withOpacity(uiScheme.fg, 0.48) }}
              >
                当前：{currentPreset.label} · {FONT_FAMILY_OPTIONS[theme.fontFamily].label} ·{" "}
                {getFlowLabel(theme.flow)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetTheme}
              disabled={isDefaultTheme}
              title={isDefaultTheme ? "已是默认样式" : "恢复默认阅读样式"}
              className="h-8 shrink-0 gap-1 rounded-full px-3 text-xs font-medium disabled:opacity-40"
              style={{
                color: uiScheme.buttonText,
                background: withOpacity(uiScheme.buttonBg, 0.42),
                border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.18)}`,
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4 sm:px-5">
          <PanelSection
            title="阅读主题"
            description="选择更适合当前环境的页面底色。"
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
                    className="rounded-xl border p-2.5 text-left transition-colors duration-200 cursor-pointer"
                    style={{
                      background: isActive
                        ? withOpacity(uiScheme.link, 0.06)
                        : withOpacity(uiScheme.cardBg, 0.32),
                      borderColor: isActive
                        ? withOpacity(uiScheme.link, 0.24)
                        : withOpacity(uiScheme.cardBorder, 0.16),
                    }}
                  >
                    <div
                      className="h-11 rounded-lg px-2.5 py-2"
                      style={{
                        background: preset.bg,
                        border: `1px solid ${
                          preset.key === "dark"
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(0,0,0,0.05)"
                        }`,
                      }}
                    >
                      <div
                        className="mb-1 h-1.5 rounded-sm"
                        style={{ background: preset.fg, width: "62%", opacity: 0.62 }}
                      />
                      <div
                        className="mb-1 h-1.5 rounded-sm"
                        style={{ background: preset.fg, width: "82%", opacity: 0.42 }}
                      />
                      <div
                        className="h-1.5 rounded-sm"
                        style={{ background: preset.fg, width: "46%", opacity: 0.26 }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span
                        className="text-xs font-medium"
                        style={{ color: isActive ? uiScheme.fg : uiScheme.buttonText }}
                      >
                        {preset.label}
                      </span>
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: isActive
                            ? withOpacity(uiScheme.link, 0.95)
                            : withOpacity(uiScheme.cardBorder, 0.34),
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </PanelSection>

          <PanelSection
            title="阅读方式"
            description="保留最常用的两种阅读模式。"
            uiScheme={uiScheme}
          >
            <div
              className="grid grid-cols-2 gap-2 rounded-xl border p-1"
              style={{
                background: withOpacity(uiScheme.cardBg, 0.28),
                borderColor: withOpacity(uiScheme.cardBorder, 0.14),
              }}
            >
              {(["paginated", "scrolled"] as const).map((flow) => {
                const isActive = theme.flow === flow;

                return (
                  <button
                    key={flow}
                    type="button"
                    onClick={() => setTheme({ flow })}
                    className="rounded-lg px-3 py-2 text-sm transition-colors duration-200 cursor-pointer"
                    style={{
                      color: isActive ? uiScheme.fg : uiScheme.mutedText,
                      background: isActive
                        ? withOpacity(uiScheme.buttonBg, 0.62)
                        : "transparent",
                      border: `1px solid ${
                        isActive
                          ? withOpacity(uiScheme.cardBorder, 0.22)
                          : "transparent"
                      }`,
                    }}
                  >
                    {flow === "paginated" ? "翻页" : "滚动"}
                  </button>
                );
              })}
            </div>
          </PanelSection>

          <PanelSection
            title="文字"
            description="只保留真正会影响阅读舒适度的排版项。"
            uiScheme={uiScheme}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs font-medium" style={{ color: uiScheme.fg }}>
                  正文字体
                </Label>
                <span
                  className="text-xs"
                  style={{ color: withOpacity(uiScheme.fg, 0.56) }}
                >
                  {FONT_FAMILY_OPTIONS[theme.fontFamily].label}
                </span>
              </div>
              <Select
                value={theme.fontFamily}
                onValueChange={(value) =>
                  setTheme({ fontFamily: value as ReaderTheme["fontFamily"] })
                }
              >
                <SelectTrigger
                  className="h-10 rounded-xl border px-3 text-sm shadow-none"
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
              <p
                className="text-xs leading-5"
                style={{ color: withOpacity(uiScheme.fg, 0.46) }}
              >
                {FONT_FAMILY_OPTIONS[theme.fontFamily].description}
              </p>
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
          </PanelSection>
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
