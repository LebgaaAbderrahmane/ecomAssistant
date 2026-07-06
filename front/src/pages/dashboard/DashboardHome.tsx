import { ShoppingCart, CheckCircle, Clock, Bell, ArrowUp, AlertTriangle, MessageSquare } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.js'

const kpis = [
  { label: 'Commandes ce mois', value: '47', delta: '+12% vs mois dernier', deltaType: 'positive', icon: ShoppingCart },
  { label: 'Taux de confirmation', value: '72%', delta: '+5% vs mois dernier', deltaType: 'positive', icon: CheckCircle },
  { label: 'Délai moyen', value: '4h 23m', delta: '-45m vs mois dernier', deltaType: 'positive', icon: Clock },
  { label: 'Relances en attente', value: '8', delta: '3 nécessitent attention', deltaType: 'warning', icon: Bell },
]

const recentOrders = [
  { id: '#0047', customer: 'Karim Bensalah', product: 'Montre Connectée SmartFit Pro', total: '12 900 DA', status: 'confirmed' as const },
  { id: '#0046', customer: 'Amina Zoubiri', product: 'Casque Bluetooth Sans Fil', total: '8 900 DA', status: 'pending' as const },
  { id: '#0045', customer: 'Yassine Hamidi', product: 'Chargeur Rapide USB-C 65W', total: '3 500 DA', status: 'pending' as const },
  { id: '#0044', customer: 'Sofiane Merabet', product: 'Support Téléphone Voiture Magnétique', total: '1 800 DA', status: 'cancelled' as const },
  { id: '#0043', customer: 'Fatima Djellali', product: 'Enceinte Portable Bluetooth', total: '5 200 DA', status: 'confirmed' as const },
]

const statusLabels: Record<string, string> = {
  confirmed: 'Confirmée',
  pending: 'En attente',
  cancelled: 'Annulée',
}

const statusVariant: Record<string, 'success' | 'warning' | 'neutral'> = {
  confirmed: 'success',
  pending: 'warning',
  cancelled: 'neutral',
}

const escalations = [
  { customer: 'Yassine Hamidi', product: 'Chargeur Rapide USB-C 65W' },
  { customer: 'Rachid Mokhtari', product: 'Montre Connectée SmartFit Pro' },
]

export function DashboardHome() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
      <p className="mt-1 text-sm text-gray-500">Aperçu des performances de votre agent WhatsApp IA</p>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="relative rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 absolute top-4 right-4">
              <kpi.icon className="h-[18px] w-[18px] text-brand-600" />
            </div>
            <p className="text-[13px] text-gray-500">{kpi.label}</p>
            <p className="mt-1 text-2xl sm:text-[28px] font-bold text-gray-900">{kpi.value}</p>
            <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${
              kpi.deltaType === 'positive' ? 'text-green-600' : 'text-amber-600'
            }`}>
              {kpi.deltaType === 'positive' && <ArrowUp className="h-3 w-3" />}
              {kpi.deltaType === 'warning' && <AlertTriangle className="h-3 w-3" />}
              <span className="truncate">{kpi.delta}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Confirmations vs Annulations</h3>
            <span className="text-xs text-gray-500">14 derniers jours</span>
          </div>
          <div className="flex items-end gap-2 h-[200px]">
            {Array.from({ length: 14 }, (_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 justify-end h-full">
                <div className="w-full bg-red-400 rounded-t" style={{ height: `${Math.random() * 40 + 10}%` }} />
                <div className="w-full bg-brand-500 rounded-t" style={{ height: `${Math.random() * 60 + 20}%` }} />
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" />
              Confirmées
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-400" />
              Annulées
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Escalades récentes</h3>
            <button className="text-[13px] font-medium text-brand-600 hover:underline">Voir tout</button>
          </div>
          {escalations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-gray-400">
              <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
              <p className="text-sm">Aucune escalade ouverte</p>
            </div>
          ) : (
            <div className="space-y-0">
              {escalations.map((esc, i) => (
                <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{esc.customer}</p>
                    <p className="text-[13px] text-gray-500 truncate">{esc.product}</p>
                  </div>
                  <Badge variant="danger" className="shrink-0 ml-auto">Escaladée</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Commandes récentes</h3>

        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-3 text-left text-[13px] font-medium text-gray-500">Commande</th>
                <th className="pb-3 text-left text-[13px] font-medium text-gray-500">Client</th>
                <th className="pb-3 text-left text-[13px] font-medium text-gray-500">Produit</th>
                <th className="pb-3 text-right text-[13px] font-medium text-gray-500">Total</th>
                <th className="pb-3 text-left text-[13px] font-medium text-gray-500">Statut</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="py-3 text-sm text-gray-900">{order.id}</td>
                  <td className="py-3 text-sm text-gray-900">{order.customer}</td>
                  <td className="py-3 text-sm text-brand-600">{order.product}</td>
                  <td className="py-3 text-right text-sm text-gray-900">{order.total}</td>
                  <td className="py-3">
                    <Badge variant={statusVariant[order.status]}>{statusLabels[order.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden space-y-3">
          {recentOrders.map((order) => (
            <div key={order.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-900">{order.id}</p>
                <Badge variant={statusVariant[order.status]}>{statusLabels[order.status]}</Badge>
              </div>
              <p className="text-sm text-gray-700">{order.customer}</p>
              <p className="text-xs text-brand-600 mt-1 truncate">{order.product}</p>
              <p className="text-sm font-medium text-gray-900 mt-1 text-right">{order.total}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
