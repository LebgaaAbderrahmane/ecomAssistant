import { useState, useEffect } from 'react'
import { Truck, X, Loader2 } from 'lucide-react'
import { Button } from './Button.js'
import { api } from '../../lib/api.js'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

interface ProviderInfo {
  key: string
  connected: boolean
  available: boolean
}

const PROVIDER_META: Record<string, { name: string; logo: string | null }> = {
  yalidine: { name: 'Yalidine', logo: '/images/providers/yalidine.png' },
  procolis: { name: 'Procolis', logo: null },
}

interface ProviderShipModalProps {
  open: boolean
  onClose: () => void
  orderIds: string[]
  onComplete: () => void
}

export function ProviderShipModal({ open, onClose, orderIds, onComplete }: ProviderShipModalProps) {
  const { t } = useTranslation('orders')
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [weight, setWeight] = useState('0.5')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (open) {
      setFetching(true)
      setSelectedProvider(null)
      setWeight('0.5')
      api.get<ProviderInfo[]>('/delivery/providers')
        .then(setProviders)
        .catch(() => setProviders([]))
        .finally(() => setFetching(false))
    }
  }, [open])

  const handleShip = async () => {
    if (!selectedProvider) return
    setLoading(true)
    let success = 0
    let errors = 0
    for (const id of orderIds) {
      try {
        await api.post(`/delivery/ship-order/${id}`, { provider: selectedProvider, weight: parseFloat(weight) || 0.5 })
        success++
      } catch {
        errors++
      }
    }
    setLoading(false)
    if (success > 0) toast.success(t('toast.shipSuccess', { count: success }))
    if (errors > 0) toast.error(t('toast.shipError'))
    onComplete()
    onClose()
  }

  if (!open) return null

  const hasSelection = selectedProvider !== null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl border border-on">
        <button onClick={onClose} className="absolute top-4 right-4 text-on-faint hover:text-on">
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-semibold text-on">{t('actions.ship')}</h2>
        <p className="mt-1 text-sm text-on-muted">{t('shipModal.selectProvider')}</p>

        {fetching ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-on-faint" />
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {providers.map((p) => {
                const meta = PROVIDER_META[p.key]
                const isActive = p.connected && p.available
                const isSelected = selectedProvider === p.key

                return (
                  <button
                    key={p.key}
                    onClick={() => isActive && setSelectedProvider(p.key)}
                    disabled={!isActive}
                    className={`relative flex flex-col items-center gap-2 rounded-lg border p-4 transition-all ${
                      isSelected
                        ? 'border-brand-600 ring-2 ring-brand-600 bg-brand-50/50'
                        : isActive
                          ? 'border-on hover:border-brand-600 hover:shadow-sm cursor-pointer'
                          : 'border-on-light opacity-50 cursor-not-allowed'
                    }`}
                  >
                    {meta?.logo ? (
                      <img src={meta.logo} alt={meta.name} className="h-12 w-36 object-contain" />
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-surface-secondary flex items-center justify-center">
                        <Truck className="h-6 w-6 text-on-faint" />
                      </div>
                    )}
                    <span className="text-sm font-medium text-on">{meta?.name ?? p.key}</span>
                    {!isActive && (
                      <span className="text-xs text-on-faint">
                        {p.available ? t('shipModal.notConnected') : t('shipModal.notAvailable')}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {hasSelection && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-on-secondary mb-1">{t('shipModal.weight')}</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="block w-full h-10 rounded-md border border-on bg-surface px-3 text-sm text-on placeholder:text-on-faint focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
                {t('cancel', { ns: 'common' })}
              </Button>
              <Button size="sm" onClick={handleShip} loading={loading} disabled={!hasSelection || !weight || parseFloat(weight) <= 0}>
                {t('shipModal.confirm')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
