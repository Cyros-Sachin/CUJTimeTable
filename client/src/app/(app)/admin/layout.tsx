'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { RequireAuth } from '@/auth/RequireAuth';

const TABS = [
  { href: '/admin/departments', label: 'Departments' },
  { href: '/admin/programs', label: 'Programs' },
  { href: '/admin/time-slots', label: 'Time Slots' },
  { href: '/admin/subject-types', label: 'Subject Types' },
  { href: '/admin/sessions-cycles', label: 'Sessions & Cycles' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/branding', label: 'Letterhead & Signature' },
  { href: '/admin/audit-log', label: 'Audit Log' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAuth role="EXAM_CELL">
      <div className="flex flex-col gap-4">
        <nav className="flex flex-wrap gap-1 border-b border-border">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                'rounded-t px-3 py-2 text-sm font-medium',
                pathname === tab.href ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-text',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </RequireAuth>
  );
}
