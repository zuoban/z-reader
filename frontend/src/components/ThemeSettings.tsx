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
  FONT_FAMILY_OPTIONS,
  type ReaderTheme,
  type ThemeColors,
} from "@/hooks/useReaderTheme";
import type { TTSSettings, Voice } from "@/lib/tts";
import {
  BookOpen,
  ChevronDown,
  Eye,
  EyeOff,
  Palette,
  ScrollText,
  Settings,
  Sparkles,
  Type,
  Volume2,
  Zap,
  ZapOff,
} from "lucide-react";

const FONT_ORDER: ReaderTheme["fontFamily"][] = [
  "editorial",
  "classic",
  "humanist",
];
const SUPPORTED_LOCALES = ["zh", "en", "ja", "ko"] as const;
const LOCALE_LABELS: Record<(typeof SUPPORTED_LOCALES)[number], string> = {
  zh: "中文",
  en: "英语",
  ja: "日语",
  ko: "韩语",
};

const PRESETS = [
  {
    key: "light",
    label: "明亮",
    description: "清透白纸，适合白天长时间阅读",
    bg: "#ffffff",
    fg: "#333333",
  },
  {
    key: "sepia",
    label: "纸张",
    description: "暖调纸感，接近传统书页氛围",
    bg: "#f4ecd8",
    fg: "#5c4b37",
  },
  {
    key: "green",
    label: "森林",
    description: "柔和绿色，缓解屏幕阅读疲劳",
    bg: "#cce8cf",
    fg: "#2d4a3e",
  },
  {
    key: "dark",
    label: "夜间",
    description: "低亮对比，更适合夜晚沉浸阅读",
    bg: "#1e293b",
    fg: "#e2e8f0",
  },
] as const satisfies ReadonlyArray<{
  key: ReaderTheme["preset"];
  label: string;
  description: string;
  bg: string;
  fg: string;
}>;

interface ThemeSettingsProps {
  theme: ReaderTheme;
  setTheme: (theme: Partial<ReaderTheme>) => void;
  uiScheme: ThemeColors;
  ttsSettings: TTSSettings;
  voices: Voice[];
  onUpdateTTSSettings: (settings: Partial<TTSSettings>) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface SectionCardProps {
  id: string;
  title: string;
  description: string;
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
  description: string;
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
  description,
  icon,
  summary,
  isOpen,
  onToggle,
  uiScheme,
  children,
}: SectionCardProps) {
  return (
    <section
      className="overflow-hidden rounded-2xl border transition-all duration-300"
      style={{
        background: uiScheme.cardBg,
        borderColor: isOpen ? `${uiScheme.link}30` : `${uiScheme.cardBorder}30`,
        boxShadow: isOpen
          ? `0 4px 20px ${uiScheme.cardBorder}10, 0 0 0 1px ${uiScheme.link}08 inset`
          : `0 2px 8px ${uiScheme.cardBorder}08`,
      }}
    >
      {/* 头部 - 可点击折叠 */}
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors duration-200 cursor-pointer"
        style={{
          background: isOpen ? `${uiScheme.buttonBg}18` : `${uiScheme.buttonBg}08`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* 图标 - 展开时带光晕 */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300"
            style={{
              color: isOpen ? uiScheme.link : uiScheme.mutedText,
              background: isOpen ? `${uiScheme.link}14` : `${uiScheme.cardBorder}12`,
              border: `1px solid ${isOpen ? `${uiScheme.link}28` : `${uiScheme.cardBorder}20`}`,
              boxShadow: isOpen ? `0 0 12px ${uiScheme.link}15` : "none",
            }}
          >
            {icon}
          </div>
          {/* 标题和描述 */}
          <div className="min-w-0 flex-1">
            <h3
              className="font-heading text-sm font-semibold tracking-wide"
              style={{ color: uiScheme.fg }}
            >
              {title}
            </h3>
            <p
              className="text-[11px] mt-0.5 truncate"
              style={{ color: uiScheme.mutedText }}
            >
              {description}
            </p>
          </div>
        </div>
        {/* 右侧：摘要 + 箭头 */}
        <div className="flex items-center gap-2 shrink-0">
          {summary && (
            <div className="hidden sm:block">
              <ValuePill uiScheme={uiScheme} muted={!isOpen}>
                {summary}
              </ValuePill>
            </div>
          )}
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-300"
            style={{
              color: isOpen ? uiScheme.link : uiScheme.mutedText,
              background: isOpen ? `${uiScheme.link}10` : `${uiScheme.cardBorder}10`,
              borderColor: isOpen ? `${uiScheme.link}25` : `${uiScheme.cardBorder}20`,
              transform: isOpen ? "rotate(180deg) scale(1.05)" : "rotate(0deg) scale(1)",
              boxShadow: isOpen ? `0 0 8px ${uiScheme.link}12` : "none",
            }}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        </div>
      </button>

      {/* 移动端摘要 */}
      {summary && (
        <div className="px-4 pb-3 sm:hidden">
          <ValuePill uiScheme={uiScheme} muted={!isOpen}>
            {summary}
          </ValuePill>
        </div>
      )}

      {/* 展开内容 */}
      {isOpen && (
        <div
          className="px-4 pb-4 pt-1 space-y-3"
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
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap tracking-wide"
      style={{
        color: muted ? uiScheme.mutedText : uiScheme.link,
        background: muted ? `${uiScheme.cardBorder}10` : `${uiScheme.link}12`,
        border: `1px solid ${muted ? `${uiScheme.cardBorder}20` : `${uiScheme.link}25`}`,
      }}
    >
      {children}
    </span>
  );
}

function SliderField({
  label,
  description,
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
      className="rounded-xl border p-3.5"
      style={{
        background: `${uiScheme.buttonBg}80`,
        borderColor: `${uiScheme.cardBorder}28`,
      }}
    >
      {/* 标签行 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label className="text-xs font-medium tracking-wide" style={{ color: uiScheme.fg }}>
            {label}
          </Label>
          <p
            className="text-[11px] mt-0.5 leading-relaxed"
            style={{ color: uiScheme.mutedText }}
          >
            {description}
          </p>
        </div>
        <ValuePill uiScheme={uiScheme}>{valueLabel}</ValuePill>
      </div>
      {/* 滑动条 */}
      <div className="mt-3 flex items-center gap-3">
        <span className="text-[10px] tabular-nums shrink-0 w-5 text-right" style={{ color: uiScheme.mutedText }}>
          {minLabel}
        </span>
        <Slider
          value={value}
          onValueChange={onValueChange}
          min={min}
          max={max}
          step={step}
          className="flex-1 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary/60 [&_[role=slider]]:bg-background [&_[role=slider]]:shadow-md [&_[role=slider]]:transition-all [&_[role=slider]]:duration-200 [&_[role=slider]]:hover:scale-110 [&_[role=slider]]:focus-visible:ring-2 [&_[role=slider]]:focus-visible:ring-primary/40"
        />
        <span className="text-[10px] tabular-nums shrink-0 w-5" style={{ color: uiScheme.mutedText }}>
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
  ttsSettings,
  voices,
  onUpdateTTSSettings,
  open,
  onOpenChange,
}: ThemeSettingsProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    theme: true,
    typography: true,
    layout: false,
    tts: false,
    motion: false,
  });
  const panelStyle = {
    background: `${uiScheme.cardBg}f8`,
    borderColor: `${uiScheme.cardBorder}40`,
    color: uiScheme.fg,
    boxShadow: `0 32px 80px ${uiScheme.cardBorder}25, 0 8px 24px ${uiScheme.cardBorder}15, inset 0 1px 0 rgba(255,255,255,0.45)`,
  } as const;

  const triggerClassName =
    "h-11 w-11 rounded-full border transition-all duration-200 hover:scale-[1.04] active:scale-95 cursor-pointer";
  const triggerStyle = {
    color: open ? uiScheme.link : uiScheme.buttonText,
    background: open ? `${uiScheme.link}12` : `${uiScheme.buttonBg}88`,
    border: `1px solid ${open ? `${uiScheme.link}35` : `${uiScheme.cardBorder}7a`}`,
    boxShadow: open
      ? `inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 1px ${uiScheme.link}18, 0 0 16px ${uiScheme.link}10`
      : `inset 0 1px 0 ${uiScheme.headerBg}66`,
  } as const;

  const selectStyle = {
    color: uiScheme.fg,
    borderColor: `${uiScheme.cardBorder}35`,
    background: `${uiScheme.buttonBg}90`,
  } as const;

  const currentPreset = PRESETS.find((preset) => preset.key === theme.preset) ?? PRESETS[0];
  const availableLocales = SUPPORTED_LOCALES.filter((locale) =>
    voices.some((voice) => voice.Locale.startsWith(locale)),
  );
  const localeVoicesMap = availableLocales.map((locale) => ({
    locale,
    label: LOCALE_LABELS[locale],
    voices: voices.filter((voice) => voice.Locale.startsWith(locale)),
  }));
  const selectedVoice = voices.find((voice) => voice.Name === ttsSettings.voiceName);
  const selectedLocale =
    availableLocales.find((locale) => selectedVoice?.Locale.startsWith(locale)) ??
    availableLocales[0];
  const currentLocaleVoices =
    localeVoicesMap.find((item) => item.locale === selectedLocale)?.voices ?? [];

  function handleLocaleChange(locale: string) {
    const nextVoices = voices.filter((voice) => voice.Locale.startsWith(locale));
    const nextVoice = nextVoices.find((voice) => voice.Name === ttsSettings.voiceName);

    if (nextVoice) return;

    const fallbackVoice = nextVoices[0];
    if (!fallbackVoice) return;

    onUpdateTTSSettings({
      voiceName: fallbackVoice.Name,
      style: fallbackVoice.StyleList?.[0] ?? "general",
    });
  }

  function toggleSection(sectionId: string) {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

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
        className="w-[100vw] max-w-[460px] overflow-hidden rounded-none p-0 backdrop-blur-xl sm:w-[460px] sm:max-w-[460px] sm:rounded-l-[28px]"
        style={panelStyle}
      >
        <SheetHeader
          className="border-b px-4 py-4 pb-4 pr-14 sm:px-5 relative overflow-hidden"
          style={{ borderColor: `${uiScheme.cardBorder}30` }}
        >
          {/* 装饰性背景渐变 */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 80% 50%, ${uiScheme.link}08 0%, transparent 60%)`,
            }}
          />
          <div className="flex items-start justify-between gap-3 relative">
            <div>
              <SheetTitle
                className="font-heading text-base sm:text-lg tracking-wide"
                style={{ color: uiScheme.fg }}
              >
                阅读偏好
              </SheetTitle>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: uiScheme.mutedText }}>
                让主题、版式和朗读设置更贴近你的阅读习惯。
              </p>
            </div>
            <div
              className="hidden shrink-0 rounded-xl border px-2.5 py-1 text-[10px] font-bold tracking-[0.22em] sm:block"
              style={{
                color: uiScheme.link,
                background: `${uiScheme.link}0e`,
                borderColor: `${uiScheme.link}30`,
              }}
            >
              READER
            </div>
          </div>
        </SheetHeader>

        <div className="max-h-[calc(100vh-88px)] space-y-3 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          {/* Live Preview - 增强版 */}
          <section
            className="overflow-hidden rounded-2xl border transition-all duration-300"
            style={{
              background: uiScheme.cardBg,
              borderColor: `${uiScheme.cardBorder}30`,
              boxShadow: `0 2px 16px ${uiScheme.cardBorder}0a`,
            }}
          >
            {/* 顶部标签行 */}
            <div
              className="flex items-center gap-2.5 px-4 py-2.5 relative"
              style={{ borderBottom: `1px solid ${uiScheme.cardBorder}15` }}
            >
              {/* 装饰性圆点 */}
              <div className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: `${uiScheme.link}60` }} />
                <span className="h-2 w-2 rounded-full" style={{ background: `${uiScheme.cardBorder}40` }} />
                <span className="h-2 w-2 rounded-full" style={{ background: `${uiScheme.cardBorder}25` }} />
              </div>
              <span
                className="text-[10px] font-bold tracking-[0.2em] ml-1"
                style={{ color: uiScheme.accentText }}
              >
                LIVE PREVIEW
              </span>
              <div className="flex gap-1.5 ml-auto">
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide"
                  style={{
                    background: `${uiScheme.link}12`,
                    color: uiScheme.link,
                    border: `1px solid ${uiScheme.link}25`,
                  }}
                >
                  {currentPreset.label}
                </span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide"
                  style={{
                    background: `${uiScheme.cardBorder}10`,
                    color: uiScheme.mutedText,
                    border: `1px solid ${uiScheme.cardBorder}20`,
                  }}
                >
                  {FONT_FAMILY_OPTIONS[theme.fontFamily].label}
                </span>
              </div>
            </div>
            {/* 预览内容 - 模拟书页 */}
            <div
              className="p-4 relative overflow-hidden"
              style={{
                background: currentPreset.bg,
              }}
            >
              {/* 书页内边距模拟线 */}
              <div
                className="absolute inset-x-6 top-0 bottom-0 border-l pointer-events-none"
                style={{ borderColor: `${currentPreset.fg}08` }}
              />
              <div className="relative">
                <p
                  className="text-[9px] uppercase tracking-[0.25em] font-semibold opacity-40"
                  style={{ color: currentPreset.fg, fontFamily: "var(--font-sans)" }}
                >
                  Preview
                </p>
                <h3
                  className="mt-2 text-sm font-semibold leading-snug"
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
                  这是当前设置的即时预览。调整各项参数时，右侧会同步反映变化。每一行文字都在告诉你它被阅读时的模样。
                </p>
              </div>
            </div>
          </section>

          <SectionCard
            id="theme"
            title="阅读主题"
            description="先确定页面气氛，再微调更细的排版参数。"
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
                    className="group text-left transition-all duration-250 cursor-pointer rounded-xl border p-2.5"
                    style={{
                      background: isActive ? `${uiScheme.link}0c` : uiScheme.buttonBg,
                      borderColor: isActive ? `${uiScheme.link}40` : `${uiScheme.cardBorder}25`,
                      boxShadow: isActive
                        ? `0 0 0 2px ${uiScheme.link}18, 0 4px 12px ${uiScheme.cardBorder}08`
                        : `0 1px 4px ${uiScheme.cardBorder}06`,
                    }}
                  >
                    {/* 主题色预览 - 模拟书页 */}
                    <div
                      className="h-14 rounded-lg px-2.5 flex flex-col justify-between py-2 relative overflow-hidden"
                      style={{
                        background: preset.bg,
                        border: `1px solid ${preset.key === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"}`,
                      }}
                    >
                      {/* 装饰性书页线 */}
                      <div className="absolute inset-x-3 top-2 bottom-2 border-l opacity-40" style={{ borderColor: preset.fg }} />
                      {/* 文字模拟 */}
                      <div className="relative">
                        <div className="h-1.5 rounded-sm mb-1" style={{ background: preset.fg, width: "60%", opacity: 0.7 }} />
                        <div className="h-1.5 rounded-sm mb-0.5" style={{ background: preset.fg, width: "85%", opacity: 0.5 }} />
                        <div className="h-1.5 rounded-sm" style={{ background: preset.fg, width: "45%", opacity: 0.35 }} />
                      </div>
                    </div>
                    {/* 标签和描述 */}
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[11px] font-semibold tracking-wide"
                          style={{ color: isActive ? uiScheme.link : uiScheme.fg }}
                        >
                          {preset.label}
                        </span>
                        {isActive && (
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: uiScheme.link, boxShadow: `0 0 4px ${uiScheme.link}` }}
                          />
                        )}
                      </div>
                      <p
                        className="text-[10px] leading-snug mt-1"
                        style={{ color: uiScheme.mutedText }}
                      >
                        {preset.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            id="typography"
            title="字体与节奏"
            description="决定文字的气质，以及每一屏阅读时的密度。"
            icon={<Type className="h-4 w-4" />}
            summary={`${FONT_FAMILY_OPTIONS[theme.fontFamily].label} · ${theme.fontSize}px`}
            isOpen={openSections.typography}
            onToggle={toggleSection}
            uiScheme={uiScheme}
          >
            {/* 字体选择 */}
            <div
              className="rounded-xl border p-3.5"
              style={{
                background: `${uiScheme.buttonBg}80`,
                borderColor: `${uiScheme.cardBorder}28`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Label className="text-xs font-medium tracking-wide" style={{ color: uiScheme.fg }}>
                    正文字体
                  </Label>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: uiScheme.mutedText }}>
                    选择更接近纸书、杂志或屏幕阅读的字形风格。
                  </p>
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
                  className="mt-3 h-10 rounded-xl border px-3 text-sm shadow-none"
                  style={selectStyle}
                >
                  <SelectValue placeholder="选择字体" />
                </SelectTrigger>
                <SelectContent>
                  {FONT_ORDER.map((key) => (
                    <SelectItem key={key} value={key}>
                      {FONT_FAMILY_OPTIONS[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* 字体预览 */}
              <div
                className="mt-3 rounded-xl border px-3.5 py-3 relative overflow-hidden"
                style={{
                  background: `${uiScheme.cardBorder}08`,
                  borderColor: `${uiScheme.cardBorder}18`,
                }}
              >
                {/* 装饰性背景线 */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `repeating-linear-gradient(
                      0deg,
                      transparent,
                      transparent ${Math.round(theme.lineHeight * theme.fontSize)}px,
                      ${uiScheme.cardBorder}08 ${Math.round(theme.lineHeight * theme.fontSize)}px
                    )`,
                  }}
                />
                <div className="relative">
                  <p
                    className="text-[10px] font-semibold tracking-widest uppercase opacity-50 mb-1.5"
                    style={{ color: uiScheme.mutedText }}
                  >
                    {FONT_FAMILY_OPTIONS[theme.fontFamily].description}
                  </p>
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
            </div>

            <SliderField
              label="字体大小"
              description="控制每屏文字密度，适合不同距离和设备。"
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
              description="行距更大时更舒展，更小则信息密度更高。"
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
              description="影响段落之间的停顿感和章节呼吸感。"
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
            description="控制每一页的留白、宽度和翻阅方式。"
            icon={<BookOpen className="h-4 w-4" />}
            summary={`${getFlowLabel(theme.flow)} · ${theme.maxInlineSize}px · ${gapLabel}`}
            isOpen={openSections.layout}
            onToggle={toggleSection}
            uiScheme={uiScheme}
          >
            {/* 阅读模式 */}
            <div
              className="rounded-xl border p-3.5"
              style={{
                background: `${uiScheme.buttonBg}80`,
                borderColor: `${uiScheme.cardBorder}28`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Label className="text-xs font-medium tracking-wide" style={{ color: uiScheme.fg }}>
                    阅读模式
                  </Label>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: uiScheme.mutedText }}>
                    选择更接近实体书翻页，或更连续的滚动阅读体验。
                  </p>
                </div>
                <ValuePill uiScheme={uiScheme}>{getFlowLabel(theme.flow)}</ValuePill>
              </div>

              <div
                className="mt-3 grid grid-cols-2 gap-2 rounded-xl border p-1"
                style={{ background: `${uiScheme.cardBorder}10`, borderColor: `${uiScheme.cardBorder}20` }}
              >
                {(["paginated", "scrolled"] as const).map((flow) => {
                  const isActive = theme.flow === flow;

                  return (
                    <button
                      key={flow}
                      type="button"
                      onClick={() => setTheme({ flow })}
                      className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-left transition-all duration-250 cursor-pointer"
                      style={{
                        color: isActive ? uiScheme.link : uiScheme.mutedText,
                        background: isActive ? `${uiScheme.link}0e` : "transparent",
                        border: `1px solid ${isActive ? `${uiScheme.link}30` : "transparent"}`,
                        boxShadow: isActive ? `0 2px 8px ${uiScheme.cardBorder}08` : "none",
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
                        <span className="text-[10px] opacity-65">
                          {flow === "paginated" ? "章节停顿" : "连续阅读"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <SliderField
              label="上下边距"
              description="影响页面顶部和底部的留白感。"
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
              description="适当收窄行宽，能显著提升长文阅读舒适度。"
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
              description="限制正文最大宽度，让大屏阅读不至于过散。"
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
              description="翻页模式下，控制页面之间的呼吸和分隔强度。"
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
            id="tts"
            title="朗读偏好"
            description="语速、音调和声线的快速调整。"
            icon={<Volume2 className="h-4 w-4" />}
            summary={
              availableLocales.length > 0
                ? `${selectedVoice?.LocalName ?? "默认"} · ${Math.round(ttsSettings.volume * 100)}%`
                : `音量 ${Math.round(ttsSettings.volume * 100)}%`
            }
            isOpen={openSections.tts}
            onToggle={toggleSection}
            uiScheme={uiScheme}
          >
            {/* 语速 / 音调 / 音量 — 三列紧凑横排 */}
            <div
              className="rounded-xl border p-3.5"
              style={{
                background: `${uiScheme.buttonBg}80`,
                borderColor: `${uiScheme.cardBorder}28`,
              }}
            >
              <div className="grid grid-cols-3">
                {/* 语速 */}
                <div
                  className="flex flex-col items-center gap-1.5 px-3 first:pl-0"
                  style={{ borderRight: `1px solid ${uiScheme.cardBorder}20` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold tracking-wide" style={{ color: uiScheme.fg }}>语速</span>
                  </div>
                  <Slider
                    value={[ttsSettings.rate]}
                    onValueChange={([v]) => onUpdateTTSSettings({ rate: v })}
                    min={-50}
                    max={100}
                    step={10}
                    className="w-full [&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                  />
                  <span className="text-[10px] tabular-nums" style={{ color: uiScheme.mutedText }}>
                    {ttsSettings.rate === 0 ? "正常" : `${ttsSettings.rate > 0 ? "+" : ""}${ttsSettings.rate}`}
                  </span>
                </div>

                {/* 音调 */}
                <div
                  className="flex flex-col items-center gap-1.5 px-3"
                  style={{ borderRight: `1px solid ${uiScheme.cardBorder}20` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold tracking-wide" style={{ color: uiScheme.fg }}>音调</span>
                  </div>
                  <Slider
                    value={[ttsSettings.pitch]}
                    onValueChange={([v]) => onUpdateTTSSettings({ pitch: v })}
                    min={-50}
                    max={50}
                    step={10}
                    className="w-full [&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                  />
                  <span className="text-[10px] tabular-nums" style={{ color: uiScheme.mutedText }}>
                    {ttsSettings.pitch === 0 ? "正常" : `${ttsSettings.pitch > 0 ? "+" : ""}${ttsSettings.pitch}`}
                  </span>
                </div>

                {/* 音量 */}
                <div className="flex flex-col items-center gap-1.5 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold tracking-wide" style={{ color: uiScheme.fg }}>音量</span>
                  </div>
                  <Slider
                    value={[ttsSettings.volume]}
                    onValueChange={([v]) => onUpdateTTSSettings({ volume: v })}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full [&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                  />
                  <span className="text-[10px] tabular-nums" style={{ color: uiScheme.mutedText }}>
                    {Math.round(ttsSettings.volume * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* 声线选择 — 语种 + 声线二合一 */}
            {availableLocales.length > 0 ? (
              <div
                className="rounded-xl border p-3.5"
                style={{
                  background: `${uiScheme.buttonBg}80`,
                  borderColor: `${uiScheme.cardBorder}28`,
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="text-xs font-medium tracking-wide" style={{ color: uiScheme.fg }}>
                    朗读声线
                  </span>
                  <ValuePill uiScheme={uiScheme} muted={!selectedVoice}>
                    {selectedVoice?.LocalName ?? "默认"}
                  </ValuePill>
                </div>
                {/* 语种横排选择 */}
                <div className="flex gap-1.5 mb-2.5 flex-wrap">
                  {localeVoicesMap.map((item) => {
                    const isActive = selectedLocale === item.locale;
                    return (
                      <button
                        key={item.locale}
                        type="button"
                        onClick={() => handleLocaleChange(item.locale)}
                        className="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide transition-all duration-200 cursor-pointer"
                        style={{
                          color: isActive ? uiScheme.link : uiScheme.mutedText,
                          background: isActive ? `${uiScheme.link}10` : "transparent",
                          borderColor: isActive ? `${uiScheme.link}40` : `${uiScheme.cardBorder}25`,
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                {/* 声线下拉 */}
                <Select
                  value={ttsSettings.voiceName}
                  onValueChange={(value) =>
                    onUpdateTTSSettings({
                      voiceName: value,
                      style: voices.find((v) => v.Name === value)?.StyleList?.[0] ?? "general",
                    })
                  }
                >
                  <SelectTrigger
                    className="h-10 rounded-xl border px-3 text-sm shadow-none"
                    style={selectStyle}
                  >
                    <SelectValue placeholder="选择声线" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentLocaleVoices.map((voice) => (
                      <SelectItem key={voice.Name} value={voice.Name}>
                        {voice.LocalName}
                        {voice.Gender === "Female" ? " · 女声" : voice.Gender === "Male" ? " · 男声" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div
                className="rounded-xl border p-4"
                style={{
                  background: `${uiScheme.buttonBg}80`,
                  borderColor: `${uiScheme.cardBorder}28`,
                }}
              >
                <p className="text-sm font-medium" style={{ color: uiScheme.fg }}>
                  当前没有可用系统语音
                </p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: uiScheme.mutedText }}>
                  请在系统设置中启用语音合成。
                </p>
              </div>
            )}
          </SectionCard>

          <SectionCard
            id="motion"
            title="动态效果"
            description="决定翻页动画是否参与阅读反馈。"
            icon={theme.animated ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
            summary={theme.animated ? "翻页动画已开启" : "翻页动画已关闭"}
            isOpen={openSections.motion}
            onToggle={toggleSection}
            uiScheme={uiScheme}
          >
            <div
              className="flex items-start justify-between gap-3 rounded-xl border p-3.5"
              style={{
                background: `${uiScheme.buttonBg}80`,
                borderColor: `${uiScheme.cardBorder}28`,
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <Label className="text-xs font-medium tracking-wide" style={{ color: uiScheme.fg }}>
                    翻页动画
                  </Label>
                  <ValuePill uiScheme={uiScheme} muted={!theme.animated}>
                    {theme.animated ? "已开启" : "已关闭"}
                  </ValuePill>
                </div>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: uiScheme.mutedText }}>
                  开启后更有翻书感，关闭则更利落、适合追求瞬时响应。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTheme({ animated: !theme.animated })}
                className="relative shrink-0 rounded-full transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                  width: "50px",
                  height: "28px",
                  minWidth: "50px",
                  minHeight: "28px",
                  backgroundColor: theme.animated
                    ? uiScheme.link
                    : `${uiScheme.cardBorder}50`,
                  boxShadow: theme.animated
                    ? `0 4px 16px ${uiScheme.link}35, inset 0 1px 0 rgba(255,255,255,0.15)`
                    : `inset 0 1px 2px rgba(0,0,0,0.08)`,
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
                    boxShadow: theme.animated
                      ? "0 2px 6px rgba(0,0,0,0.2), 0 0 8px rgba(255,255,255,0.3)"
                      : "0 1px 3px rgba(0,0,0,0.15)",
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
