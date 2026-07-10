import { useState, useRef, useEffect } from 'react'
import { MoreVertical } from 'lucide-react'

export interface DropdownMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'danger'
}

interface DropdownMenuProps {
  items: DropdownMenuItem[]
}

export function DropdownMenu({ items }: DropdownMenuProps) {
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        title="Plus d'actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg z-30 py-1">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                item.onClick()
                setOpen(false)
              }}
              disabled={item.disabled}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                item.variant === 'danger'
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
