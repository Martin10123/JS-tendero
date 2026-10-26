import { cn } from '@/lib/utils'
import type { HTMLAttributes, LabelHTMLAttributes } from 'react'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-ink/10 bg-cream/80 shadow-[0_20px_50px_-32px_rgba(28,22,18,0.55)] backdrop-blur-xl',
        className,
      )}
      {...props}
    />
  )
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-saffron/20 px-2.5 py-1 text-xs font-semibold text-ink',
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-ink/80', className)} {...props} />
}
