import { useState } from 'react'
import { Save, RotateCcw, Smartphone, Store, Phone, MapPin } from 'lucide-react'
import { Button } from '../../components/ui/Button.js'
import { Badge } from '../../components/ui/Badge.js'

type SettingsTab = 'agent' | 'store' | 'whatsapp' | 'wilaya'

const tabs: { id: SettingsTab; label: string; icon: typeof Store }[] = [
  { id: 'agent', label: 'Configuration agent', icon: Smartphone },
  { id: 'store', label: 'Connexion boutique', icon: Store },
  { id: 'whatsapp', label: 'WhatsApp', icon: Phone },
  { id: 'wilaya', label: 'Wilaya pricing', icon: MapPin },
]

function SegmentControl({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-md border border-gray-200">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-5 py-2 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
            value === opt
              ? 'border-2 border-brand-600 bg-white text-brand-600 -m-[1px] z-10'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function AgentConfigTab() {
  const [language, setLanguage] = useState('Auto-détection')
  const [tone, setTone] = useState('Amical')
  const [delay1, setDelay1] = useState('2')
  const [delay2, setDelay2] = useState('24')
  const [delay3, setDelay3] = useState('48')
  const [suggestProducts, setSuggestProducts] = useState(true)
  const [provider, setProvider] = useState('Yalidine')

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Configuration agent</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Mode linguistique</label>
        <SegmentControl
          options={['Derja', 'Français', 'MSA', 'Auto-détection']}
          value={language}
          onChange={setLanguage}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Ton</label>
        <SegmentControl
          options={['Amical', 'Formel']}
          value={tone}
          onChange={setTone}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Délais de relance</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={delay1}
            onChange={(e) => setDelay1(e.target.value)}
            className="w-20 h-10 rounded-md border border-gray-300 px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <span className="text-sm text-gray-500">heures</span>
          <span className="text-gray-300 text-lg">→</span>
          <input
            type="number"
            value={delay2}
            onChange={(e) => setDelay2(e.target.value)}
            className="w-20 h-10 rounded-md border border-gray-300 px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <span className="text-sm text-gray-500">heures</span>
          <span className="text-gray-300 text-lg">→</span>
          <input
            type="number"
            value={delay3}
            onChange={(e) => setDelay3(e.target.value)}
            className="w-20 h-10 rounded-md border border-gray-300 px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <span className="text-sm text-gray-500">heures</span>
        </div>
        <p className="mt-1 text-[13px] text-gray-500">Relances max : 3</p>
      </div>

      <div className="flex items-center justify-between rounded-md border border-gray-200 p-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Suggérer des produits associés</p>
          <p className="text-[13px] text-gray-500">Après confirmation, proposer des articles complémentaires</p>
        </div>
        <button
          onClick={() => setSuggestProducts(!suggestProducts)}
          className={`relative h-6 w-11 rounded-full transition-colors ${suggestProducts ? 'bg-brand-600' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-[2px] left-[2px] h-5 w-5 rounded-full bg-white transition-transform ${suggestProducts ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Transporteur</label>
        <SegmentControl
          options={['Yalidine', 'Procolis']}
          value={provider}
          onChange={setProvider}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="primary" className="gap-2">
          <Save className="h-4 w-4" />
          Enregistrer
        </Button>
        <Button variant="secondary" className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Réinitialiser
        </Button>
      </div>
    </div>
  )
}

function StoreConnectionTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Connexion boutique</h2>
      <div className="rounded-md border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Shopify — Ma Boutique</p>
            <p className="text-[13px] text-gray-500">ma-boutique.myshopify.com</p>
          </div>
          <Badge variant="success">Connecté</Badge>
        </div>
        <p className="mt-3 text-[13px] text-gray-500">Dernière synchronisation : 11/06/2026 à 14:30</p>
        <div className="mt-4 flex gap-3">
          <Button variant="secondary">Reconnecter</Button>
          <Button variant="secondary">Resynchroniser le catalogue</Button>
        </div>
        <button className="mt-4 text-[13px] font-medium text-red-600 hover:underline">Déconnecter la boutique</button>
      </div>
    </div>
  )
}

function WhatsAppTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">WhatsApp</h2>
      <div className="rounded-md border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">+213 555 12 34 56</p>
            <p className="text-[13px] text-gray-500">Boutique Al Manar</p>
          </div>
          <Badge variant="danger">Déconnecté</Badge>
        </div>
        <Button variant="secondary" className="mt-4">Reconnecter avec Meta</Button>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Modèles de message</h3>
        <div className="space-y-2">
          {[
            { name: 'Confirmation de commande', status: 'approved' as const },
            { name: 'Mise à jour de livraison', status: 'pending' as const },
            { name: 'Relance panier abandonné', status: 'approved' as const },
          ].map((tmpl) => (
            <div key={tmpl.name} className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3">
              <span className="text-sm text-gray-900">{tmpl.name}</span>
              <Badge variant={tmpl.status === 'approved' ? 'success' : 'warning'}>
                {tmpl.status === 'approved' ? 'Approuvé' : 'En attente'}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WilayaPricingTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Wilaya pricing</h2>
      <p className="text-sm text-gray-500">Tableau des frais de livraison par wilaya (à implémenter)</p>
    </div>
  )
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('agent')

  const content: Record<SettingsTab, React.ReactNode> = {
    agent: <AgentConfigTab />,
    store: <StoreConnectionTab />,
    whatsapp: <WhatsAppTab />,
    wilaya: <WilayaPricingTab />,
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
      <p className="mt-1 text-sm text-gray-500">Gérez votre boutique, votre agent et vos paramètres de livraison</p>

      <div className="mt-6 flex gap-6">
        <div className="w-[220px] shrink-0">
          <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center gap-3 rounded-md px-4 py-[10px] text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-[18px] w-[18px]" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 rounded-lg border border-gray-200 bg-white p-[20px_24px]">
          {content[activeTab]}
        </div>
      </div>
    </div>
  )
}
