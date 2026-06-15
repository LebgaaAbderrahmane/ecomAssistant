import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { CheckCircle } from 'lucide-react'

const steps = [
  'Boutique connectée et synchronisée',
  'Numéro WhatsApp lié',
  'Agent configuré',
  'Grille tarifaire de livraison complétée',
]

export function Activation() {
  const navigate = useNavigate()
  const [activating, setActivating] = useState(false)

  const handleActivate = async () => {
    setActivating(true)
    setTimeout(() => {
      setActivating(false)
      navigate('/dashboard')
    }, 1500)
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <h2 className="text-2xl font-bold text-gray-900">Activation</h2>
      <p className="mt-1 text-sm text-gray-500">
        Vérifiez les éléments ci-dessous avant d'activer votre agent
      </p>

      <Card className="mt-8">
        <ul className="space-y-4">
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <CheckCircle className={`mt-0.5 h-5 w-5 flex-shrink-0 ${index < 2 ? 'text-green-500' : 'text-gray-300'}`} />
              <span className={`text-sm ${index < 2 ? 'text-gray-900' : 'text-gray-400'}`}>{step}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-8 text-center">
        <Button size="lg" loading={activating} onClick={handleActivate}>
          Activer mon agent
        </Button>
        <p className="mt-2 text-xs text-gray-400">
          Vous pourrez modifier ces réglages plus tard depuis les paramètres
        </p>
      </div>
    </div>
  )
}
