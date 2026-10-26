import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-ink text-cream hover:bg-ink/90',
        brand:
          'relative overflow-hidden bg-gradient-to-r from-saffron to-clay text-ink shadow-[0_12px_30px_-14px_rgba(212,101,58,0.9)] hover:brightness-105 active:scale-[0.98] before:absolute before:inset-y-0 before:left-0 before:w-1/2 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/50 before:to-transparent hover:before:translate-x-[220%] before:transition-transform before:duration-700',
        outline: 'border border-ink/15 bg-cream/70 hover:bg-cream',
        ghost: 'hover:bg-ink/5',
        moss: 'bg-moss text-cream hover:bg-moss/90',
      },
      size: {
        default: 'min-h-11 px-4',
        lg: 'min-h-12 px-5 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
