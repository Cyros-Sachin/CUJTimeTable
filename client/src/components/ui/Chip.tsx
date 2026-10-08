import { Lock } from 'lucide-react';
import clsx from 'clsx';

type Kind = 'regular' | 'reappear' | 'locked' | 'open' | 'neutral';

const KIND_CLASSES: Record<Kind, string> = {
  regular: 'bg-primary-soft text-primary',
  reappear: 'bg-amber-100 text-accent',
  locked: 'bg-gray-200 text-gray-700',
  open: 'bg-green-100 text-success',
  neutral: 'bg-page text-muted border border-border',
};

export function Chip({ kind = 'neutral', children }: { kind?: Kind; children: React.ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', KIND_CLASSES[kind])}>
      {kind === 'locked' ? <Lock size={12} /> : null}
      {children}
    </span>
  );
}
