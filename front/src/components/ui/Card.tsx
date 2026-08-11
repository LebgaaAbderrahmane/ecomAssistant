import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-[20px_24px]',
  lg: 'p-8',
}

export function Card({ padding = 'md', className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-on bg-surface ${paddingStyles[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
