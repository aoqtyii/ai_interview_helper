import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
};

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition',
        'focus:outline-none focus:ring-2 focus:ring-cyan/60 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-cyan text-black hover:bg-acid',
        variant === 'ghost' && 'border border-line bg-white/5 text-slate-100 hover:border-cyan/60 hover:bg-cyan/10',
        variant === 'danger' && 'bg-red-500/20 text-red-100 hover:bg-red-500/30',
        className
      )}
      {...props}
    />
  );
}
