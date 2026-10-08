'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { LayoutDashboard, FilePlus, CalendarDays, Table2, Settings, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import type { Role } from '@/api/types';

const NAV_ITEMS: Array<{ href: string; label: string; icon: typeof LayoutDashboard; roles: Role[] }> = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['DEPT_COORDINATOR', 'EXAM_CELL'] },
  { href: '/entries/new', label: 'Add Entry', icon: FilePlus, roles: ['DEPT_COORDINATOR', 'EXAM_CELL'] },
  { href: '/datesheets', label: 'Date Sheet', icon: CalendarDays, roles: ['DEPT_COORDINATOR', 'EXAM_CELL'] },
  { href: '/consolidated', label: 'Consolidated', icon: Table2, roles: ['EXAM_CELL'] },
  { href: '/admin/departments', label: 'Admin', icon: Settings, roles: ['EXAM_CELL'] },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const items = NAV_ITEMS.filter((item) => !user || item.roles.includes(user.role));

  return (
    <>
      {open ? <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} /> : null}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-64 transform border-r border-border bg-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div>
            <p className="text-sm font-bold text-primary">CUJ Date Sheet</p>
            <p className="text-xs text-muted">Exam Automation</p>
          </div>
          <button type="button" className="lg:hidden" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  'flex items-center gap-2 rounded px-3 py-2 text-sm font-medium',
                  active ? 'bg-primary-soft text-primary' : 'text-text hover:bg-page',
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {user ? (
          <div className="mt-auto border-t border-border p-3 text-xs text-muted">
            <p className="font-medium text-text">{user.name}</p>
            <p>{user.department ? user.department.name : 'Exam Cell'}</p>
          </div>
        ) : null}
      </aside>
    </>
  );
}
