import { forwardRef, type InputHTMLAttributes } from 'react';
import clsx from 'clsx';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...rest }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'w-full rounded border bg-white px-3 py-2 text-sm text-text placeholder:text-muted',
        'focus:outline-none focus:ring-2 focus:ring-primary/50',
        invalid ? 'border-danger' : 'border-border',
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';
