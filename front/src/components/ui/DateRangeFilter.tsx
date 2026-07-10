import { useState, useRef, useEffect } from 'react'
import { Calendar } from 'lucide-react'

interface DateRangeOption {
  value: string
  label: string
}

const defaultOptions: DateRangeOption[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois-ci' },
  { value: 'year', label: 'Cette année' },
  { value: 'all', label: 'Toutes les dates' }
]

interface DateRangeFilterProps {
  value: string | null
  onChange: (value: string | null) => void
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const active = value !== null
  const activeLabel = defaultOptions.find(o => o.value === value)?.label

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
          active
            ? 'border-brand-600 bg-brand-50 text-brand-600'
            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
        }`}
      >
        <Calendar className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">{active ? activeLabel : 'Date'}</span>
        {active && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold text-white">
            1
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg z-20 py-1">
          {defaultOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => {
                   onChange(opt.value === 'all' ? null : value === opt.value ? null : opt.value)
                   setOpen(false)
                 }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                value === opt.value || (opt.value === 'all' && value === null)
                  ? 'text-brand-600 font-medium bg-brand-50'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
