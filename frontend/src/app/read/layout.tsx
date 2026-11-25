import type { ReactNode } from 'react';
import { AppToaster } from '@/components/AppToaster';
import { MantineAppProvider } from '@/components/MantineAppProvider';

export default function ReadLayout({ children }: { children: ReactNode }) {
  return (
    <MantineAppProvider>
      {children}
      <AppToaster />
    </MantineAppProvider>
  );
}
