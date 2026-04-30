import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_SC, Noto_Serif_SC } from 'next/font/google';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ErrorSuppressor } from '@/components/ErrorSuppressor';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const notoSansSC = Noto_Sans_SC({
  variable: '--font-noto-sans-sc',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
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
    { media: '(prefers-color-scheme: light)', color: '#f0f2f8' },
    { media: '(prefers-color-scheme: dark)', color: '#080c18' },
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
      className={`${inter.variable} ${notoSansSC.variable} ${notoSerifSC.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background font-sans">
        <ThemeProvider>
          <TooltipProvider>
            <ServiceWorkerRegistration />
            <ErrorSuppressor />
            {children}
            <Toaster
              position="top-center"
              toastOptions={{
                style: {
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  border: '1px solid var(--border)',
                  borderRadius: '1rem',
                },
              }}
            />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
