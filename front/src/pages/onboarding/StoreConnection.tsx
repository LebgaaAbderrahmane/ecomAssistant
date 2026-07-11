import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'
import { Card } from '../../components/ui/Card.js'
import { ShoppingBag, Globe, AlertTriangle } from 'lucide-react'
import { api } from '../../lib/api.js'

type Platform = 'shopify' | 'woocommerce' | null

export function StoreConnection() {
  const navigate = useNavigate()
  const [platform, setPlatform] = useState<Platform>(null)
  const [domain, setDomain] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cleanup = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    setConnecting(false)
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const handleConnectShopify = useCallback(() => {
    if (!domain) return
    setError('')
    setConnecting(true)

    const fullDomain = domain.includes('.myshopify.com') ? domain : `${domain}.myshopify.com`

    const popup = window.open(
      `/store-connection/shopify/authenticate?shop=${fullDomain}`,
      'shopify-oauth',
      'width=600,height=700',
    )

    if (!popup) {
      setConnecting(false)
      setError(
        "Le popup a été bloqué par votre navigateur. Autorisez les popups pour ce site et réessayez, " +
        "ou connectez votre boutique depuis les paramètres plus tard.",
      )
      return
    }

    // Poll for successful connection
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.get<{ connected: boolean }>('/store-connection/status')
        if (status.connected) {
          cleanup()
          navigate('/onboarding/whatsapp')
        }
      } catch { /* keep polling */ }
    }, 2000)

    // Detect popup closed without success
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed)
        cleanup()
        setError(
          "Fenêtre Shopify fermée. Si l'application est en cours de validation par Shopify, " +
          "vous ne pourrez pas l'installer. Vous pouvez réessayer ou passer cette étape.",
        )
      }
    }, 500)

    // Timeout after 2 minutes
    timeoutRef.current = setTimeout(() => {
      clearInterval(checkClosed)
      cleanup()
      setError("La connexion a pris trop de temps. Vérifiez que l'application Shopify est autorisée à s'installer.")
    }, 120000)
  }, [domain, cleanup, navigate])

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <h2 className="text-2xl font-bold text-on">Connectez votre boutique</h2>
      <p className="mt-1 text-sm text-on-muted">
        Choisissez votre plateforme e-commerce pour synchroniser vos produits et commandes
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <button
          onClick={() => { setPlatform('shopify'); setError('') }}
          className={`rounded-xl border-2 p-6 text-center transition-all hover:shadow-md ${
            platform === 'shopify'
              ? 'border-brand-600 bg-brand-50'
              : 'border-on bg-surface'
          }`}
        >
          <ShoppingBag className="mx-auto h-10 w-10 text-on-secondary" />
          <p className="mt-3 font-semibold text-on">Shopify</p>
          <p className="mt-1 text-xs text-on-muted">Via OAuth</p>
        </button>

        <button
          onClick={() => navigate('/onboarding/whatsapp')}
          className={`rounded-xl border-2 p-6 text-center transition-all hover:shadow-md ${
            platform === 'woocommerce'
              ? 'border-brand-600 bg-brand-50'
              : 'border-on bg-surface'
          }`}
        >
          <Globe className="mx-auto h-10 w-10 text-on-secondary" />
          <p className="mt-3 font-semibold text-on">WooCommerce</p>
          <p className="mt-1 text-xs text-on-muted">Via clé API</p>
        </button>
      </div>

      {platform === 'shopify' && (
        <Card className="mt-6 space-y-4">
          <Input
            label="Nom de votre boutique Shopify"
            type="text"
            placeholder="ma-boutique"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <p className="text-xs text-on-faint">Exemple : ma-boutique → ma-boutique.myshopify.com</p>
          <Button onClick={handleConnectShopify} loading={connecting} disabled={!domain}>
            {connecting ? 'Connexion en cours...' : 'Connecter Shopify'}
          </Button>
        </Card>
      )}

      {error && (
        <Card className="mt-6 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-3">
              <p className="text-sm text-amber-900">{error}</p>
              <div className="flex gap-3">
                <Button variant="secondary" size="sm" onClick={handleConnectShopify}>
                  Réessayer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/onboarding/whatsapp')}>
                  Continuer sans boutique →
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {!platform && !error && (
        <div className="mt-8 text-center text-sm text-on-faint">
          Sélectionnez une plateforme pour continuer
        </div>
      )}
    </div>
  )
}
