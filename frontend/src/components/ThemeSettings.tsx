'use client';

import { ReaderTheme } from '@/hooks/useReaderTheme';
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
}

export function ThemeSettings({ theme, setTheme }: ThemeSettingsProps) {
  return (
    <Dialog>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer">
        Theme
      </DialogTrigger>
      <DialogContent className="max-w-sm bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Reader Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="space-y-3">
            <Label className="text-slate-300">Theme</Label>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTheme({ preset: p.key })}
                  className={`rounded-lg p-3 flex flex-col items-center gap-1.5 border-2 transition-all ${
                    theme.preset === p.key
                      ? 'border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                  style={{ background: p.bg }}
                >
                  <div
                    className="w-5 h-5 rounded-full border-2 border-slate-400"
                    style={{ background: p.fg }}
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

          <Separator className="bg-slate-700" />

          <div className="space-y-3">
            <Label className="text-slate-300">Font Size</Label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme({ fontSize: Math.max(12, theme.fontSize - 2) })}
                disabled={theme.fontSize <= 12}
                className="w-8 h-8 border-slate-700 bg-slate-800"
              >
                -
              </Button>
              <span className="text-slate-300 w-12 text-center font-mono">
                {theme.fontSize}px
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme({ fontSize: Math.min(28, theme.fontSize + 2) })}
                disabled={theme.fontSize >= 28}
                className="w-8 h-8 border-slate-700 bg-slate-800"
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
                  className={`flex-1 text-xs ${
                    theme.fontSize === size
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>

          <Separator className="bg-slate-700" />

          <div className="space-y-3">
            <Label className="text-slate-300">Line Height</Label>
            <div className="flex gap-1">
              {[1.4, 1.5, 1.6, 1.8, 2.0].map((lh) => (
                <Button
                  key={lh}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ lineHeight: lh })}
                  className={`flex-1 text-xs ${
                    theme.lineHeight === lh
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {lh}
                </Button>
              ))}
            </div>
          </div>

          <Separator className="bg-slate-700" />

          <div className="space-y-3">
            <Label className="text-slate-300">Page Margin</Label>
            <div className="flex gap-1">
              {[20, 40, 60, 80, 100].map((m) => (
                <Button
                  key={m}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ margin: m })}
                  className={`flex-1 text-xs ${
                    theme.margin === m
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
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