import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { CheckCircle } from 'lucide-react'
import { api } from '../../lib/api.js'

const steps = [
  'Boutique connectée et synchronisée',
  'Numéro WhatsApp lié',
  'Agent configuré',
  'Grille tarifaire de livraison complétée',
]

export function Activation() {
  const navigate = useNavigate()
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState('')

  const handleActivate = async () => {
    setActivating(true)
    setError('')
    try {
      await api.post('/agent-config/activate', {})
      navigate('/dashboard')
    } catch {
      navigate('/dashboard')
    } finally {
      setActivating(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <h2 className="text-2xl font-bold text-on">Activation</h2>
      <p className="mt-1 text-sm text-on-muted">
        Vérifiez les éléments ci-dessous avant d'activer votre agent
      </p>

      <Card className="mt-8">
        <ul className="space-y-4">
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <CheckCircle className={`mt-0.5 h-5 w-5 flex-shrink-0 ${index < 2 ? 'text-green-500' : 'text-gray-300'}`} />
              <span className={`text-sm ${index < 2 ? 'text-on' : 'text-on-faint'}`}>{step}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-8 text-center">
        <Button size="lg" loading={activating} onClick={handleActivate}>
          Activer mon agent
        </Button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-2 text-xs text-on-faint">
          Vous pourrez modifier ces réglages plus tard depuis les paramètres
        </p>
      </div>
    </div>
  )
}
