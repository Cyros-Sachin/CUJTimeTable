import { forwardRef, type SelectHTMLAttributes } from 'react';
import clsx from 'clsx';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className, invalid, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={clsx(
        'w-full rounded border bg-white px-3 py-2 text-sm text-text',
        'focus:outline-none focus:ring-2 focus:ring-primary/50',
        invalid ? 'border-danger' : 'border-border',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
