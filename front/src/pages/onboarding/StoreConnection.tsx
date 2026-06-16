import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'
import { Card } from '../../components/ui/Card.js'
import { ShoppingBag, Globe } from 'lucide-react'

type Platform = 'shopify' | 'woocommerce' | null

export function StoreConnection() {
  const navigate = useNavigate()
  const [platform, setPlatform] = useState<Platform>(null)
  const [domain, setDomain] = useState('')

  const handleContinue = () => {
    navigate('/onboarding/whatsapp')
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <h2 className="text-2xl font-bold text-gray-900">Connectez votre boutique</h2>
      <p className="mt-1 text-sm text-gray-500">
        Choisissez votre plateforme e-commerce pour synchroniser vos produits et commandes
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <button
          onClick={() => setPlatform('shopify')}
          className={`rounded-xl border-2 p-6 text-center transition-all hover:shadow-md ${
            platform === 'shopify'
              ? 'border-brand-600 bg-brand-50'
              : 'border-gray-200 bg-white'
          }`}
        >
          <ShoppingBag className="mx-auto h-10 w-10 text-gray-700" />
          <p className="mt-3 font-semibold text-gray-900">Shopify</p>
          <p className="mt-1 text-xs text-gray-500">Via OAuth</p>
        </button>

        <button
          onClick={() => setPlatform('woocommerce')}
          className={`rounded-xl border-2 p-6 text-center transition-all hover:shadow-md ${
            platform === 'woocommerce'
              ? 'border-brand-600 bg-brand-50'
              : 'border-gray-200 bg-white'
          }`}
        >
          <Globe className="mx-auto h-10 w-10 text-gray-700" />
          <p className="mt-3 font-semibold text-gray-900">WooCommerce</p>
          <p className="mt-1 text-xs text-gray-500">Via clé API</p>
        </button>
      </div>

      {platform === 'shopify' && (
        <Card className="mt-6">
          <p className="text-sm text-gray-600">
            Vous serez redirigé vers Shopify pour autoriser la connexion.
          </p>
          <Button className="mt-4" onClick={handleContinue}>
            Connecter Shopify
          </Button>
        </Card>
      )}

      {platform === 'woocommerce' && (
        <Card className="mt-6 space-y-4">
          <Input
            label="URL de la boutique"
            type="url"
            placeholder="https://votre-boutique.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <Input
            label="Clé API (Consumer Key)"
            type="text"
            placeholder="ck_..."
          />
          <Input
            label="Secret API (Consumer Secret)"
            type="password"
            placeholder="cs_..."
          />
          <Button onClick={handleContinue}>Connecter WooCommerce</Button>
        </Card>
      )}

      {!platform && (
        <div className="mt-8 text-center text-sm text-gray-400">
          Sélectionnez une plateforme pour continuer
        </div>
      )}
    </div>
  )
}
