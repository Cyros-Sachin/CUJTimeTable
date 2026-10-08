'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
