import type { Metadata, Viewport } from 'next';
import { Crimson_Text, Playfair_Display, Noto_Serif_SC } from 'next/font/google';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorSuppressor } from '@/components/ErrorSuppressor';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import './globals.css';

const crimsonText = Crimson_Text({
  variable: '--font-crimson',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
});

const playfairDisplay = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  display: 'swap',
});

const notoSerifSC = Noto_Serif_SC({
  variable: '--font-noto-serif-sc',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f0e8' },
    { media: '(prefers-color-scheme: dark)', color: '#161412' },
  ],
};

export const metadata: Metadata = {
  title: 'Z Reader',
  description: 'A refined online reading experience for your digital library',
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
    description: 'A refined online reading experience for your digital library',
  },
  twitter: {
    card: 'summary',
    title: 'Z Reader',
    description: 'A refined online reading experience for your digital library',
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
      className={`${crimsonText.variable} ${playfairDisplay.variable} ${notoSerifSC.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background font-sans">
        <ThemeProvider>
          <TooltipProvider>
            <a
              href="#main-content"
              className="fixed left-4 top-4 z-[1000] -translate-y-16 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
