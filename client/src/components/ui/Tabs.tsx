'use client';

import clsx from 'clsx';

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <div role="tablist" className="inline-flex rounded-full border border-border bg-white p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            value === opt.value ? 'bg-primary text-white' : 'text-muted hover:text-text',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
