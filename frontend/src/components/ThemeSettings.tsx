'use client';

import { ReaderTheme, ThemeColors } from '@/hooks/useReaderTheme';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const PRESETS = [
  { key: 'light', label: 'Light', bg: '#ffffff', fg: '#333333' },
  { key: 'sepia', label: 'Sepia', bg: '#f4ecd8', fg: '#5c4b37' },
  { key: 'green', label: 'Eye Care', bg: '#cce8cf', fg: '#2d4a3e' },
  { key: 'dark', label: 'Dark', bg: '#1e293b', fg: '#e2e8f0' },
] as const;

interface ThemeSettingsProps {
  theme: ReaderTheme;
  setTheme: (theme: Partial<ReaderTheme>) => void;
  uiScheme: ThemeColors;
}

export function ThemeSettings({ theme, setTheme, uiScheme }: ThemeSettingsProps) {
  return (
    <Dialog>
      <DialogTrigger 
        className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer"
        style={{
          border: `1px solid ${uiScheme.cardBorder}`,
          background: uiScheme.buttonBg,
          color: uiScheme.buttonText,
        }}
      >
        Theme
      </DialogTrigger>
      <DialogContent 
        className="max-w-sm"
        style={{
          background: uiScheme.cardBg,
          borderColor: uiScheme.cardBorder,
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: uiScheme.fg }}>Reader Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="space-y-3">
            <Label style={{ color: uiScheme.buttonText }}>Theme</Label>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTheme({ preset: p.key })}
                  className="rounded-lg p-3 flex flex-col items-center gap-1.5 border-2 transition-all"
                  style={{
                    background: p.bg,
                    borderColor: theme.preset === p.key ? '#3b82f6' : uiScheme.cardBorder,
                    boxShadow: theme.preset === p.key ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none',
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full border-2"
                    style={{ background: p.fg, borderColor: uiScheme.mutedText }}
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: p.fg }}
                  >
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Separator style={{ background: uiScheme.cardBorder }} />

          <div className="space-y-3">
            <Label style={{ color: uiScheme.buttonText }}>Font Size</Label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme({ fontSize: Math.max(12, theme.fontSize - 2) })}
                disabled={theme.fontSize <= 12}
                className="w-8 h-8"
                style={{
                  borderColor: uiScheme.cardBorder,
                  background: uiScheme.buttonBg,
                  color: uiScheme.buttonText,
                }}
              >
                -
              </Button>
              <span 
                className="w-12 text-center font-mono"
                style={{ color: uiScheme.buttonText }}
              >
                {theme.fontSize}px
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme({ fontSize: Math.min(28, theme.fontSize + 2) })}
                disabled={theme.fontSize >= 28}
                className="w-8 h-8"
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
                  className="flex-1 text-xs transition-colors"
                  style={{
                    background: theme.fontSize === size ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    color: theme.fontSize === size ? '#3b82f6' : uiScheme.mutedText,
                    borderColor: theme.fontSize === size ? '#3b82f6' : 'transparent',
                  }}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>

          <Separator style={{ background: uiScheme.cardBorder }} />

          <div className="space-y-3">
            <Label style={{ color: uiScheme.buttonText }}>Line Height</Label>
            <div className="flex gap-1">
              {[1.4, 1.5, 1.6, 1.8, 2.0].map((lh) => (
                <Button
                  key={lh}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ lineHeight: lh })}
                  className="flex-1 text-xs transition-colors"
                  style={{
                    background: theme.lineHeight === lh ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    color: theme.lineHeight === lh ? '#3b82f6' : uiScheme.mutedText,
                    borderColor: theme.lineHeight === lh ? '#3b82f6' : 'transparent',
                  }}
                >
                  {lh}
                </Button>
              ))}
            </div>
          </div>

          <Separator style={{ background: uiScheme.cardBorder }} />

          <div className="space-y-3">
            <Label style={{ color: uiScheme.buttonText }}>Page Margin</Label>
            <div className="flex gap-1">
              {[20, 40, 60, 80, 100].map((m) => (
                <Button
                  key={m}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ margin: m })}
                  className="flex-1 text-xs transition-colors"
                  style={{
                    background: theme.margin === m ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    color: theme.margin === m ? '#3b82f6' : uiScheme.mutedText,
                    borderColor: theme.margin === m ? '#3b82f6' : 'transparent',
                  }}
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