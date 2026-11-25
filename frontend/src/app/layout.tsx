import type { Metadata, Viewport } from 'next';
import { mantineHtmlProps } from '@mantine/core';
import '@fontsource/crimson-text/latin-400.css';
import '@fontsource/crimson-text/latin-600.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-500.css';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-700.css';
// Unicode ranges keep arbitrary book titles covered without downloading the full CJK font.
import '@fontsource/noto-serif-sc/400.css';
import './fonts/noto-serif-sc-compat.css';
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
    { media: '(prefers-color-scheme: light)', color: '#f7f5f0' },
    { media: '(prefers-color-scheme: dark)', color: '#141312' },
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

const THEME_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem('z-reader-theme');var parsed=raw?JSON.parse(raw):null;var p=parsed&&parsed.preset;var preset=(p==='dark'||p==='sepia'||p==='green'||p==='light')?p:'light';var isDark=preset==='dark';var r=document.documentElement;r.classList.toggle('dark',isDark);r.dataset.readerPreset=preset;r.setAttribute('data-mantine-color-scheme',isDark?'dark':'light');r.style.colorScheme=isDark?'dark':'light';}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      {...mantineHtmlProps}
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background font-sans">
        <ThemeProvider>
          <a
            href="#main-content"
            className="fixed left-[max(1rem,env(safe-area-inset-left,0px))] top-[max(1rem,env(safe-area-inset-top,0px))] z-[var(--z-skip-link)] -translate-y-24 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-[0_12px_28px_-16px_var(--paper-shadow)] transition-transform motion-reduce:transition-none focus:translate-y-0 focus-visible:translate-y-0 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            跳到主内容
          </a>
          <ServiceWorkerRegistration />
          <ErrorSuppressor />
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
