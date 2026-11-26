"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ActionIcon, Slider, Tabs } from "@mantine/core";
import "@mantine/core/styles/Slider.layer.css";
import "@mantine/core/styles/Tabs.layer.css";
import { useUncontrolled } from "@mantine/hooks";
import { Check, ChevronDown, ChevronUp, Minus, Plus, RotateCcw } from "lucide-react";

import { ensureReaderFontPack } from "@/lib/reader-font-packs";
import {
  getModernReaderSurface,
  withOpacity,
} from "@/lib/reader-ui";
import { ReaderSheet } from "@/components/reader/ReaderSheet";
import { cn } from "@/lib/utils";
import {
  DEFAULT_READER_THEME,
  FONT_FAMILY_OPTIONS,
  PRESET_STYLES,
  type ReaderTheme,
  type ThemeColors,
} from "@/hooks/useReaderTheme";

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
}

interface SliderFieldProps {
  label: string;
  valueLabel: string;
  minLabel: string;
  maxLabel: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  uiScheme: ThemeColors;
}

function stepNumericValue(
  current: number,
  direction: -1 | 1,
  min: number,
  max: number,
  step: number,
) {
  const decimals = step.toString().split(".")[1]?.length ?? 0;
  const next = Math.min(max, Math.max(min, current + direction * step));
  return Number(next.toFixed(decimals));
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
      className={cn(
        "reader-settings-option flex min-h-11 flex-1 items-center justify-center gap-1.5 border px-2.5 text-sm",
        active && "font-medium",
      )}
      style={active ? undefined : { borderColor: "var(--reader-panel-rule)" }}
    >
      {active && <Check aria-hidden="true" className="size-3.5 shrink-0" />}
      <span>{label}</span>
    </button>
  );
}

function SliderField({
  label,
  valueLabel,
  minLabel,
  maxLabel,
  value,
  onChange,
  min,
  max,
  step,
  uiScheme,
}: SliderFieldProps) {
  const labelId = useId();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <span id={labelId} className="text-sm font-medium" style={{ color: uiScheme.fg }}>
          {label}
        </span>
        <span
          className="text-xs font-medium tabular-nums"
          style={{ color: uiScheme.link }}
        >
          {valueLabel}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          className="reader-panel-stepper"
          disabled={value <= min}
          onClick={() => onChange(stepNumericValue(value, -1, min, max, step))}
          aria-label={`减小${label}`}
          title={`减小${label}（最小 ${minLabel}）`}
        >
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <Slider
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          label={null}
          thumbLabel={label}
          aria-labelledby={labelId}
          size="sm"
          className="flex-1"
          classNames={{
            track: "cursor-pointer",
            thumb: "reader-panel-slider-thumb",
          }}
          styles={{
            track: {
              backgroundColor: withOpacity(uiScheme.cardBorder, 0.7),
            },
            bar: {
              backgroundColor: uiScheme.link,
            },
            thumb: {
              borderColor: uiScheme.link,
              backgroundColor: uiScheme.cardBg,
            },
          }}
        />
        <button
          type="button"
          className="reader-panel-stepper"
          disabled={value >= max}
          onClick={() => onChange(stepNumericValue(value, 1, min, max, step))}
          aria-label={`增大${label}`}
          title={`增大${label}（最大 ${maxLabel}）`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
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
      className="mb-5 rounded-lg border px-4 transition-colors duration-200"
      aria-label="阅读效果预览"
      style={{
        background: preset.bg,
        color: preset.fg,
        borderColor: withOpacity(preset.fg, 0.12),
        "--reader-preview-fg": preset.fg,
        "--reader-preview-accent": preset.link,
      } as CSSProperties}
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
          className="reader-preview-toggle"
        >
          {expanded ? "收起预览" : "展开预览"}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
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
}: ThemeSettingsProps) {
  const [isOpen, setIsOpen] = useUncontrolled({
    value: open,
    defaultValue: false,
    finalValue: false,
    onChange: onOpenChange,
  });
  const resetFeedbackTimeoutRef = useRef<number | null>(null);
  const [isResetFeedbackVisible, setIsResetFeedbackVisible] = useState(false);
  const [resetFeedbackCount, setResetFeedbackCount] = useState(0);
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const appearancePanelLabelId = useId();
  const layoutPanelLabelId = useId();
  const advancedPanelLabelId = useId();
  const surface = getModernReaderSurface(uiScheme);

  useEffect(() => {
    if (!isOpen) return;
    void ensureReaderFontPack("editorial");
    void ensureReaderFontPack("classic");
  }, [isOpen]);

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
    }, 1500);
    setTheme(DEFAULT_READER_THEME);
  }

  const isDefaultTheme = (
    Object.keys(DEFAULT_READER_THEME) as Array<keyof ReaderTheme>
  ).every((key) => theme[key] === DEFAULT_READER_THEME[key]);

  return (
    <ReaderSheet
      open={isOpen}
      onClose={() => setIsOpen(false)}
      headerClassName=""
      title="阅读偏好"
      titleAddon={
        isResetFeedbackVisible ? (
          <span
            role="status"
            aria-live="polite"
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              background: withOpacity(uiScheme.link, 0.12),
              color: uiScheme.link,
            }}
          >
            已恢复默认
          </span>
        ) : null
      }
      subtitle={
        <p className="mt-0.5 text-xs" style={{ color: surface.muted }}>
          调整纸色、字号与版式细节
        </p>
      }
      headerActions={
        <ActionIcon
          type="button"
          variant="subtle"
          size={44}
          radius="md"
          onClick={handleResetTheme}
          disabled={isDefaultTheme}
          title="重置阅读偏好"
          aria-label="重置阅读偏好"
          className="reader-panel-icon"
        >
          <RotateCcw
            className="h-4 w-4 transition-transform duration-300 ease-out motion-reduce:transition-none"
            aria-hidden="true"
            style={{
              transform: `rotate(${resetFeedbackCount * 360}deg)`,
            }}
          />
        </ActionIcon>
      }
      closeLabel="关闭阅读偏好"
      uiScheme={uiScheme}
      overlayContainer={overlayContainer}
    >
      <Tabs
        value={activeSection}
        onChange={(value) => {
          if (value) setActiveSection(value as SettingsSection);
        }}
        keepMounted={false}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        styles={{
          list: {
            "--tabs-list-border-width": "0px",
          },
            }}
          >
            <Tabs.List
              grow
              aria-label="阅读设置分类"
              className="grid shrink-0 grid-cols-3 border-b px-4 sm:px-6"
              style={{ borderColor: surface.hairline }}
            >
              {SETTINGS_SECTIONS.map((section) => (
                <Tabs.Tab
                  key={section.id}
                  value={section.id}
                  className="reader-panel-tab"
                >
                  {section.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            <div className="reader-panel-body custom-scrollbar px-4 pb-5 pt-4 sm:px-6">
              <ReaderPreview theme={theme} />

              <Tabs.Panel
                value="appearance"
                aria-labelledby={appearancePanelLabelId}
                className="space-y-5"
              >
                <span id={appearancePanelLabelId} className="sr-only">外观设置</span>
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
                          style={isActive ? undefined : { borderColor: surface.hairline }}
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
              </Tabs.Panel>

              <Tabs.Panel
                value="layout"
                aria-labelledby={layoutPanelLabelId}
                className="space-y-5"
              >
                <span id={layoutPanelLabelId} className="sr-only">排版设置</span>
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">字型选择</h3>
                  <div
                    className="divide-y overflow-hidden rounded-[var(--paper-radius-control)] border"
                    style={{ borderColor: surface.hairline }}
                  >
                    {FONT_ORDER.map((key) => {
                      const option = FONT_FAMILY_OPTIONS[key];
                      const isActive = theme.fontFamily === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setTheme({ fontFamily: key })}
                          aria-pressed={isActive}
                          className="reader-settings-row flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left"
                          style={{ borderColor: surface.hairline }}
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn("block text-base", isActive && "font-medium")}
                              style={{
                                fontFamily: option.stack,
                                color: isActive ? uiScheme.link : surface.fg,
                              }}
                            >
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
                  value={theme.fontSize}
                  onChange={(value) => setTheme({ fontSize: value })}
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
                  value={theme.lineHeight}
                  onChange={(value) => setTheme({ lineHeight: value })}
                  min={1.2}
                  max={2.2}
                  step={0.05}
                  uiScheme={uiScheme}
                />
              </Tabs.Panel>

              <Tabs.Panel
                value="advanced"
                aria-labelledby={advancedPanelLabelId}
                className="space-y-5"
              >
                <span id={advancedPanelLabelId} className="sr-only">高级排版设置</span>
                <SliderField
                  label="左右页边距"
                  valueLabel={`${theme.pagePaddingX}px`}
                  minLabel="8"
                  maxLabel="56"
                  value={theme.pagePaddingX}
                  onChange={(value) => setTheme({ pagePaddingX: value })}
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
                  value={theme.pagePaddingY}
                  onChange={(value) => setTheme({ pagePaddingY: value })}
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
                  value={theme.paragraphSpacing}
                  onChange={(value) => setTheme({ paragraphSpacing: value })}
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
                  value={theme.maxInlineSize}
                  onChange={(value) => setTheme({ maxInlineSize: value })}
                  min={520}
                  max={1400}
                  step={20}
                  uiScheme={uiScheme}
                />

                <div
                  className="space-y-3 border-t pt-4"
                  style={{ borderColor: surface.hairline }}
                >
                  <span className="block pl-0.5 text-xs font-medium" style={{ color: surface.muted }}>
                    中文排版
                  </span>
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
              </Tabs.Panel>
            </div>
          </Tabs>
    </ReaderSheet>
  );
}
