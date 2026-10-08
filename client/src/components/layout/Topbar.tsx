'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, LogOut, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/auth/AuthContext';
import { useLogout } from '@/api/queries';

export function Topbar({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const logout = useLogout();
  const router = useRouter();

  async function handleLogout() {
    await logout.mutateAsync();
    toast.success('Logged out');
    router.replace('/login');
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <button type="button" className="lg:hidden" onClick={onMenuClick} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold text-text">{title}</h1>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-sm font-medium text-text hover:bg-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {user?.name || 'Account'}
        </button>
        {menuOpen ? (
          <div className="absolute right-0 z-20 mt-1 w-48 rounded border border-border bg-white py-1 shadow-subtle">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-page"
              onClick={() => { setMenuOpen(false); router.push('/change-password'); }}
            >
              <KeyRound size={16} /> Change password
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-page"
              onClick={handleLogout}
            >
              <LogOut size={16} /> Log out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
