import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-[13px] font-medium text-on-secondary mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`block w-full h-10 rounded-md border bg-surface px-[10px] py-[10px] text-sm text-on transition-colors placeholder:text-on-faint focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 ${
          error ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-on'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
