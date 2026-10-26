import { cn } from '@/lib/utils'
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'min-h-10 w-full rounded-xl border border-ink/15 bg-cream/80 px-3 text-sm text-ink transition-all duration-300 placeholder:text-muted/80 focus-visible:border-saffron focus-visible:ring-2 focus-visible:ring-saffron',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-20 w-full rounded-xl border border-ink/15 bg-cream/80 px-3 py-2 text-sm text-ink transition-all duration-300 placeholder:text-muted focus-visible:border-saffron focus-visible:ring-2 focus-visible:ring-saffron',
        className,
      )}
      {...props}
    />
  )
}
