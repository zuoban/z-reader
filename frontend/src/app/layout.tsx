import type { Metadata, Viewport } from 'next';
import '@fontsource/crimson-text/latin-400.css';
import '@fontsource/crimson-text/latin-600.css';
import '@fontsource/crimson-text/latin-700.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-500.css';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/noto-serif-sc/chinese-simplified-400.css';
import '@fontsource/noto-serif-sc/chinese-simplified-600.css';
import '@fontsource/noto-serif-sc/chinese-simplified-700.css';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorSuppressor } from '@/components/ErrorSuppressor';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f0e8' },
    { media: '(prefers-color-scheme: dark)', color: '#141210' },
  ],
};

export const metadata: Metadata = {
  title: 'Z Reader',
  description: '安静的多格式电子书阅读器，私有书库与多端续读',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Z Reader',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'Z Reader',
    title: 'Z Reader',
    description: '安静的多格式电子书阅读器，私有书库与多端续读',
  },
  twitter: {
    card: 'summary',
    title: 'Z Reader',
    description: '安静的多格式电子书阅读器，私有书库与多端续读',
  },
  icons: {
    shortcut: [
      { url: '/favicon.ico', sizes: 'any' },
    ],
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background font-sans">
        <ThemeProvider>
          <TooltipProvider>
            <a
              href="#main-content"
              className="fixed left-4 top-4 z-[var(--z-skip-link)] -translate-y-16 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_12px_28px_-16px_var(--paper-shadow)] transition-transform focus:translate-y-0 focus-visible:translate-y-0 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              跳到主内容
            </a>
            <ServiceWorkerRegistration />
            <ErrorSuppressor />
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
            <Toaster
              position="top-center"
              closeButton
              toastOptions={{
                closeButtonAriaLabel: '关闭通知',
                style: {
                  background:
                    'linear-gradient(135deg, color-mix(in srgb, var(--glass-specular) 18%, transparent) 0%, transparent 34%), color-mix(in srgb, var(--card) 86%, transparent)',
                  color: 'var(--foreground)',
                  border: '1px solid color-mix(in srgb, var(--border), transparent 35%)',
                  borderRadius: '1rem',
                  paddingRight: '3.25rem',
                  boxShadow:
                    '0 20px 44px -28px var(--paper-shadow), inset 0 1px 0 color-mix(in srgb, var(--glass-specular) 46%, transparent)',
                  backdropFilter: 'blur(20px) saturate(1.25)',
                },
              }}
            />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
