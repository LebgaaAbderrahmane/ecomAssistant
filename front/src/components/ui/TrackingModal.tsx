import { useState } from 'react'
import { Button } from './Button.js'

interface TrackingModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (trackingNumber: string, deliveryProvider: string) => void
  loading?: boolean
}

export function TrackingModal({ open, onClose, onConfirm, loading }: TrackingModalProps) {
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
        <h2 className="text-lg font-semibold text-on">Attribuer un suivi</h2>
        <p className="mt-1 text-sm text-on-muted">
          Entrez les informations de suivi pour les commandes sélectionnées.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-on-secondary mb-1">Transporteur</label>
            <select
              value={deliveryProvider}
              onChange={(e) => setDeliveryProvider(e.target.value)}
              className="block w-full h-10 rounded-md border border-on bg-surface px-3 text-sm text-on focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
            >
              <option value="yalidine">Yalidine</option>
              <option value="procolis">Procolis</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-secondary mb-1">Numéro de suivi</label>
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
            Annuler
          </Button>
          <Button size="sm" onClick={handleConfirm} loading={loading} disabled={!trackingNumber.trim()}>
            Confirmer
          </Button>
        </div>
      </div>
    </div>
  )
}
