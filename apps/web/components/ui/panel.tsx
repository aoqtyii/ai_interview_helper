import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={clsx('rounded-lg border border-line bg-panel/86 p-5 shadow-glow', className)} {...props} />;
}
