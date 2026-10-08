'use client';

import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto rounded bg-white shadow-subtle`}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:bg-page hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
