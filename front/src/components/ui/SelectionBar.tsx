import { X } from 'lucide-react'

export interface SelectionAction {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'danger'
}

interface SelectionBarProps {
  count: number
  singularLabel?: string
  pluralLabel?: string
  actions: SelectionAction[]
  onClear: () => void
}

export function SelectionBar({
  count,
  singularLabel = 'sélectionnée',
  pluralLabel = 'sélectionnées',
  actions,
  onClear,
}: SelectionBarProps) {
  if (count === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="flex items-center gap-2 rounded-full border border-on bg-surface px-2 py-1.5 shadow-lg">
        <span className="pl-3 text-sm font-semibold text-on whitespace-nowrap">
          {count} {count === 1 ? singularLabel : pluralLabel}
        </span>

        <div className="mx-1 h-5 w-px bg-on-light" />

        {actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.label}
            className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              action.variant === 'danger'
                ? 'text-on-muted hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20'
                : 'text-on-muted hover:text-brand-600 hover:bg-brand-50 dark:hover:text-brand-400 dark:hover:bg-brand-900/20'
            }`}
          >
            {action.icon}
          </button>
        ))}

        <div className="mx-1 h-5 w-px bg-on-light" />

        <button
          onClick={onClear}
          title="Désélectionner"
          className="inline-flex items-center justify-center h-8 w-8 rounded-full text-on-faint hover:text-on-muted hover:bg-surface-tertiary transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
