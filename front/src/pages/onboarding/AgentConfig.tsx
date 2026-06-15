import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'
import { Card } from '../../components/ui/Card.js'

export function AgentConfig() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <h2 className="text-2xl font-bold text-gray-900">Configurez votre agent</h2>
      <p className="mt-1 text-sm text-gray-500">
        Personnalisez le comportement de l'agent IA
      </p>

      <Card className="mt-8 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Langue par défaut</label>
          <select className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="auto">Détection automatique</option>
            <option value="derdja">Derdja</option>
            <option value="french">Français</option>
            <option value="arabic">Arabe</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Ton de l'agent</label>
          <div className="mt-2 flex gap-4">
            {['Formel', 'Amical'].map((tone) => (
              <label key={tone} className="flex items-center gap-2">
                <input type="radio" name="tone" defaultChecked={tone === 'Amical'} className="text-brand-600" />
                <span className="text-sm text-gray-700">{tone}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input label="1er suivi (heures)" type="number" defaultValue={2} min={1} />
          <Input label="2e suivi (heures)" type="number" defaultValue={24} min={1} />
          <Input label="3e suivi (heures)" type="number" defaultValue={48} min={1} />
        </div>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button onClick={() => navigate('/onboarding/activate')}>
          Continuer
        </Button>
      </div>
    </div>
  )
}
