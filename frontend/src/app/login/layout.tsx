import type { ReactNode } from 'react';
import { MantineAppProvider } from '@/components/MantineAppProvider';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <MantineAppProvider>{children}</MantineAppProvider>;
}
