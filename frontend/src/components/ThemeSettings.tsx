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
import { Settings } from 'lucide-react';

const PRESETS = [
  { key: 'light', label: '明亮', bg: '#ffffff', fg: '#333333' },
  { key: 'sepia', label: '纸张', bg: '#f4ecd8', fg: '#5c4b37' },
  { key: 'green', label: '森林', bg: '#cce8cf', fg: '#2d4a3e' },
  { key: 'dark', label: '夜间', bg: '#1e293b', fg: '#e2e8f0' },
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
        render={
          <Button 
            variant="ghost" 
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          />
        }
      >
        <Settings className="w-4 h-4" />
      </DialogTrigger>
      <DialogContent 
        className="max-w-sm backdrop-blur-sm"
        closeButtonClassName="text-current hover:bg-muted/30 hover:text-current"
        style={{
          background: `${uiScheme.cardBg}f5`,
          borderColor: uiScheme.cardBorder,
          color: uiScheme.fg,
        }}
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="font-heading text-lg" style={{ color: uiScheme.fg }}>
            阅读偏好
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-3">
          <div className="space-y-2.5">
            <Label className="font-heading text-sm" style={{ color: uiScheme.fg }}>主题</Label>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTheme({ preset: p.key })}
                  className="rounded-md p-2 flex flex-col items-center gap-1.5 border transition-all duration-200"
                  style={{
                    background: p.bg,
                    borderColor: theme.preset === p.key ? uiScheme.link : `${uiScheme.cardBorder}80`,
                    boxShadow: theme.preset === p.key ? `0 0 0 2px ${uiScheme.link}30` : 'none',
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full border"
                    style={{ background: p.fg, borderColor: `${uiScheme.cardBorder}60` }}
                  />
                  <span
                    className="font-sans text-xs"
                    style={{ color: p.fg }}
                  >
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Separator style={{ background: `${uiScheme.cardBorder}60` }} />

          <div className="space-y-2.5">
            <Label className="font-heading text-sm" style={{ color: uiScheme.fg }}>字体大小</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => setTheme({ fontSize: Math.max(12, theme.fontSize - 2) })}
                disabled={theme.fontSize <= 12}
                className="border-border/40"
                style={{
                  borderColor: uiScheme.cardBorder,
                  background: uiScheme.buttonBg,
                  color: uiScheme.buttonText,
                }}
              >
                −
              </Button>
              <span 
                className="w-14 text-center font-mono text-sm tabular-nums"
                style={{ color: uiScheme.fg }}
              >
                {theme.fontSize}px
              </span>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => setTheme({ fontSize: Math.min(28, theme.fontSize + 2) })}
                disabled={theme.fontSize >= 28}
                className="border-border/40"
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
                  className="flex-1 font-mono text-xs transition-all duration-200 rounded"
                  style={{
                    background: theme.fontSize === size ? `${uiScheme.link}20` : 'transparent',
                    color: theme.fontSize === size ? uiScheme.link : uiScheme.mutedText,
                    border: theme.fontSize === size ? `1px solid ${uiScheme.link}40` : '1px solid transparent',
                  }}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>

          <Separator style={{ background: `${uiScheme.cardBorder}60` }} />

          <div className="space-y-2.5">
            <Label className="font-heading text-sm" style={{ color: uiScheme.fg }}>行高</Label>
            <div className="flex gap-1">
              {[1.4, 1.5, 1.6, 1.8, 2.0].map((lh) => (
                <Button
                  key={lh}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ lineHeight: lh })}
                  className="flex-1 font-mono text-xs transition-all duration-200 rounded"
                  style={{
                    background: theme.lineHeight === lh ? `${uiScheme.link}20` : 'transparent',
                    color: theme.lineHeight === lh ? uiScheme.link : uiScheme.mutedText,
                    border: theme.lineHeight === lh ? `1px solid ${uiScheme.link}40` : '1px solid transparent',
                  }}
                >
                  {lh}
                </Button>
              ))}
            </div>
          </div>
          <Separator style={{ background: `${uiScheme.cardBorder}60` }} />

          <div className="space-y-2.5">
            <Label className="font-heading text-sm" style={{ color: uiScheme.fg }}>页边距</Label>
            <div className="flex gap-1">
              {[20, 40, 60, 80, 100].map((m) => (
                <Button
                  key={m}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme({ margin: m })}
                  className="flex-1 font-mono text-xs transition-all duration-200 rounded"
                  style={{
                    background: theme.margin === m ? `${uiScheme.link}20` : 'transparent',
                    color: theme.margin === m ? uiScheme.link : uiScheme.mutedText,
                    border: theme.margin === m ? `1px solid ${uiScheme.link}40` : '1px solid transparent',
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