'use client';

import { usePathname } from 'next/navigation';
import { RequireAuth } from '@/auth/RequireAuth';
import { AppShell } from '@/components/layout/AppShell';

const TITLES: Array<[string, string]> = [
  ['/entries/new', 'Add Entry'],
  ['/entries', 'Edit Entry'],
  ['/datesheets', 'Date Sheet'],
  ['/consolidated', 'Consolidated'],
  ['/admin', 'Admin'],
  ['/', 'Dashboard'],
];

function titleFor(pathname: string) {
  const match = TITLES.find(([prefix]) => pathname === prefix || (prefix !== '/' && pathname.startsWith(prefix)));
  return match ? match[1] : 'CUJ Date Sheet';
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAuth>
      <AppShell title={titleFor(pathname)}>{children}</AppShell>
    </RequireAuth>
  );
}
