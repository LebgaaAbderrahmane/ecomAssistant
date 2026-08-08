import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button.js'
import { DELIVERY_PROVIDERS } from '@ecomassistant/shared'

interface TrackingModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (trackingNumber: string, deliveryProvider: string) => void
  loading?: boolean
}

export function TrackingModal({ open, onClose, onConfirm, loading }: TrackingModalProps) {
  const { t } = useTranslation('common')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [deliveryProvider, setDeliveryProvider] = useState('yalidine')

  if (!open) return null

  const handleConfirm = () => {
    if (!trackingNumber.trim()) return
    onConfirm(trackingNumber.trim(), deliveryProvider)
  }

  const handleClose = () => {
    setTrackingNumber('')
    setDeliveryProvider('yalidine')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl border border-on">
        <h2 className="text-lg font-semibold text-on">{t('tracking.title')}</h2>
        <p className="mt-1 text-sm text-on-muted">
          {t('tracking.description')}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-on-secondary mb-1">{t('tracking.provider')}</label>
            <select
              value={deliveryProvider}
              onChange={(e) => setDeliveryProvider(e.target.value)}
              className="block w-full h-10 rounded-md border border-on bg-surface px-3 text-sm text-on focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
            >
              {DELIVERY_PROVIDERS.map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-secondary mb-1">{t('tracking.number')}</label>
            <input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Ex: YAL123456789"
              className="block w-full h-10 rounded-md border border-on bg-surface px-3 text-sm text-on placeholder:text-on-faint focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={loading}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleConfirm} loading={loading} disabled={!trackingNumber.trim()}>
            {t('confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}
