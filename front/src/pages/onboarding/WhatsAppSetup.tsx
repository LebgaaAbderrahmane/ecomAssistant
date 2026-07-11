import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, XCircle, Loader2 } from 'lucide-react'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { api } from '../../lib/api.js'
import { useTranslation } from 'react-i18next'

type Stage = 'idle' | 'loading' | 'qr' | 'connecting' | 'connected' | 'error'

export function WhatsAppSetup() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('idle')
  const [qrBase64, setQrBase64] = useState('')
  const [error, setError] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { t } = useTranslation('onboarding')

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const connect = async () => {
    setStage('loading')
    setError('')
    try {
      const { qrBase64 } = await api.post<{ qrBase64: string }>('/whatsapp/session', {})
      setQrBase64(qrBase64)
      setStage('qr')

      setStage('connecting')
      intervalRef.current = setInterval(async () => {
        try {
          const { status } = await api.get<{ status: string }>('/whatsapp/session/status')
          if (status === 'connected') {
            stopPolling()
            setStage('connected')
            setTimeout(() => navigate('/onboarding/agent'), 2000)
          }
        } catch {
          // keep polling
        }
      }, 3000)
    } catch (err: unknown) {
      stopPolling()
      const msg = err instanceof Error ? err.message : 'Erreur de connexion'
      setError(msg)
      setStage('error')
    }
  }

  useEffect(() => {
    return () => stopPolling()
  }, [])

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <h2 className="text-2xl font-bold text-on">{t('whatsapp.title')}</h2>
      <p className="mt-1 text-sm text-on-muted">
        {t('whatsapp.description')}
      </p>

      <Card className="mt-8">
        <div className="text-center">
          {stage === 'idle' && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg className="h-8 w-8 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <p className="text-sm text-gray-600">
                {t('whatsapp.instruction')}
              </p>
              <Button size="lg" className="mt-6 bg-green-600 hover:bg-green-700" onClick={connect}>
                {t('whatsapp.connectButton')}
              </Button>
            </>
          )}

          {stage === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
              <p className="text-sm text-on-muted">{t('whatsapp.configuring')}</p>
            </div>
          )}

          {(stage === 'qr' || stage === 'connecting') && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm font-medium text-on-secondary">
                {t('whatsapp.scanQR')}
              </p>
              <div className="rounded-lg border-2 border-dashed border-on p-4">
                <img
                  src={`data:image/png;base64,${qrBase64}`}
                  alt={t('whatsapp.qrLabel')}
                  className="h-64 w-64"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-on-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('whatsapp.waitingScan')}
              </div>
            </div>
          )}

          {stage === 'connected' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-lg font-semibold text-green-700">{t('whatsapp.connected')}</p>
              <p className="text-sm text-on-muted">{t('whatsapp.redirecting')}</p>
            </div>
          )}

          {stage === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <p className="text-sm text-red-600">{error}</p>
              <Button variant="secondary" onClick={connect}>
                {t('whatsapp.retry')}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button variant="ghost" onClick={() => navigate('/onboarding/agent')}>
          {t('whatsapp.skip')}
        </Button>
      </div>
    </div>
  )
}
