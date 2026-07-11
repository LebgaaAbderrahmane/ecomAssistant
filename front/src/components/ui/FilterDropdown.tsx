import { useState, useRef, useEffect } from 'react'
import { SlidersHorizontal } from 'lucide-react'

interface FilterDropdownProps {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (values: string[]) => void
  label: string
  placeholder: string
}

export function FilterDropdown({ options, selected, onChange, label, placeholder }: FilterDropdownProps) {
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

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const allSelected = selected.length === options.length
  const toggleAll = () => {
    if (allSelected) {
      onChange([])
    } else {
      onChange(options.map(o => o.value))
    }
  }

  const active = selected.length > 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
          active
            ? 'border-brand-600 bg-brand-50 text-brand-600'
            : 'border-on text-on-secondary hover:bg-surface-secondary'
        }`}
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">{label}</span>
        {active && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold text-white">
            {selected.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-on bg-surface shadow-lg z-20 py-1">
          <label className="flex items-center gap-2 px-3 py-2 text-sm text-on-secondary hover:bg-surface-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-on accent-green-600"
            />
            Tout sélectionner
          </label>
          <div className="mx-3 border-t border-on-light" />
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-2 text-sm text-on-secondary hover:bg-surface-secondary cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="h-4 w-4 rounded border-on accent-green-600"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
