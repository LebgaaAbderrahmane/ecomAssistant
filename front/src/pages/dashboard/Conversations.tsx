import { useState } from 'react'
import { Search, Phone, Clock } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.js'

type FilterTab = 'all' | 'pending' | 'confirmed' | 'escalated' | 'failed'

interface Conversation {
  id: string
  customer: string
  phone: string
  lastMessage: string
  orderStatus: 'confirmed' | 'pending' | 'cancelled' | 'failed'
  lang: 'DZ' | 'FR' | 'AR'
  activity: string
}

const conversations: Conversation[] = [
  { id: '1', customer: 'Karim Bensalah', phone: '+213 556 789 234', lastMessage: 'Tmam! Merci bcp, rana nest...', orderStatus: 'confirmed', lang: 'DZ', activity: '3d ago' },
  { id: '2', customer: 'Amina Zoubiri', phone: '+213 557 654 321', lastMessage: 'Wach kayen d\'autres couleu...', orderStatus: 'pending', lang: 'FR', activity: '2d ago' },
  { id: '3', customer: 'Yassine Hamidi', phone: '+213 556 789 234', lastMessage: 'Bghit nkalem ma3a wahed, h...', orderStatus: 'pending', lang: 'DZ', activity: '1d ago' },
  { id: '4', customer: 'Fatima Djellali', phone: '+213 558 987 654', lastMessage: 'Hala, chkun inta?', orderStatus: 'pending', lang: 'AR', activity: '4h ago' },
  { id: '5', customer: 'Sofiane Merabet', phone: '+213 559 876 543', lastMessage: 'Désolé, j\'ai changé d\'avis. A...', orderStatus: 'cancelled', lang: 'FR', activity: '5d ago' },
  { id: '6', customer: 'Nadia Rahmouni', phone: '+213 557 123 456', lastMessage: 'Automated: last follow-up sent', orderStatus: 'failed', lang: 'DZ', activity: '6d ago' },
]

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  confirmed: 'success',
  pending: 'warning',
  escalated: 'danger',
  cancelled: 'neutral',
  failed: 'neutral',
}

const statusLabels: Record<string, string> = {
  confirmed: 'Confirmée',
  pending: 'En attente',
  escalated: 'Escaladée',
  cancelled: 'Annulée',
  failed: 'Échouée',
}

const filterTabs: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'pending', label: 'En attente' },
  { id: 'confirmed', label: 'Confirmées' },
  { id: 'escalated', label: 'Escaladées' },
  { id: 'failed', label: 'Échouées' },
]

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
      {initial}
    </div>
  )
}

function LangBadge({ lang }: { lang: string }) {
  return (
    <span className="inline-flex h-5 w-7 items-center justify-center rounded-[4px] bg-gray-100 text-[11px] font-bold tracking-wider text-gray-700">
      {lang}
    </span>
  )
}

export function Conversations() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')

  const filtered = conversations.filter((c) => {
    const matchesSearch = c.customer.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
    const matchesFilter = activeFilter === 'all' || c.orderStatus === activeFilter
    return matchesSearch && matchesFilter
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
          <p className="mt-1 text-sm text-gray-500">{conversations.length} conversations au total</p>
        </div>
      </div>

      <div className="mt-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Rechercher par nom ou téléphone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full h-10 rounded-md border border-gray-300 pl-[38px] pr-[10px] py-[10px] text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeFilter === tab.id
                ? 'bg-brand-600 text-white'
                : 'border border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Client</th>
              <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Téléphone</th>
              <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Dernier message</th>
              <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Commande</th>
              <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Langue</th>
              <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Activité</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((conv) => (
              <tr key={conv.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={conv.customer} />
                    <span className="text-sm font-medium text-gray-900">{conv.customer}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <Phone className="h-[14px] w-[14px] text-gray-400" />
                    {conv.phone}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="max-w-[200px] truncate text-sm text-gray-500">{conv.lastMessage}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant[conv.orderStatus]}>{statusLabels[conv.orderStatus]}</Badge>
                </td>
                <td className="px-4 py-3">
                  <LangBadge lang={conv.lang} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <Clock className="h-[14px] w-[14px] text-gray-400" />
                    {conv.activity}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                  Aucune conversation ne correspond à ce filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
