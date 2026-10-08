'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary/90 focus-visible:ring-primary',
  secondary: 'bg-white text-text border border-border hover:bg-page focus-visible:ring-primary',
  danger: 'bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger',
  ghost: 'bg-transparent text-text hover:bg-page focus-visible:ring-primary',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {loading ? 'Please wait…' : children}
    </button>
  ),
);
Button.displayName = 'Button';
