import type { ReactNode } from 'react';
import { AppToaster } from '@/components/AppToaster';

export default function ShelfLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AppToaster />
    </>
  );
}
