import type { ReactNode } from 'react';

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text">{label}</label>
      {children}
      {hint && !error ? <span className="text-xs text-muted">{hint}</span> : null}
      {error ? <span className="text-xs text-danger" role="alert">{error}</span> : null}
    </div>
  );
}
