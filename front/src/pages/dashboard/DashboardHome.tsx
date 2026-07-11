import { ShoppingCart, CheckCircle, Clock, Bell, ArrowUp, AlertTriangle, MessageSquare } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.js'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('dashboard')

  const kpis = [
    { label: t('kpi.ordersThisMonth'), value: '47', delta: '+12% vs mois dernier', deltaType: 'positive', icon: ShoppingCart },
    { label: t('kpi.confirmationRate'), value: '72%', delta: '+5% vs mois dernier', deltaType: 'positive', icon: CheckCircle },
    { label: t('kpi.avgDelay'), value: '4h 23m', delta: '-45m vs mois dernier', deltaType: 'positive', icon: Clock },
    { label: t('kpi.pendingFollowUps'), value: '8', delta: '3 nécessitent attention', deltaType: 'warning', icon: Bell },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-on">{t('title')}</h1>
      <p className="mt-1 text-sm text-on-muted">{t('subtitle')}</p>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="relative rounded-lg border border-on bg-surface p-4 sm:p-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 absolute top-4 right-4">
              <kpi.icon className="h-[18px] w-[18px] text-brand-600" />
            </div>
            <p className="text-[13px] text-on-muted">{kpi.label}</p>
            <p className="mt-1 text-2xl sm:text-[28px] font-bold text-on">{kpi.value}</p>
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
        <div className="rounded-lg border border-on bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-on">{t('chart.title')}</h3>
            <span className="text-xs text-on-muted">{t('chart.period')}</span>
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
            <span className="flex items-center gap-1.5 text-xs text-on-muted">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" />
              {t('chart.confirmed')}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-on-muted">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-400" />
              {t('chart.cancelled')}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-on bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-on">{t('recentEscalations')}</h3>
            <button className="text-[13px] font-medium text-brand-600 hover:underline">{t('viewAll')}</button>
          </div>
          {escalations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-on-faint">
              <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
              <p className="text-sm">{t('noEscalations')}</p>
            </div>
          ) : (
            <div className="space-y-0">
              {escalations.map((esc, i) => (
                <div key={i} className="flex items-start gap-3 py-3 border-b border-on-light last:border-0">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on">{esc.customer}</p>
                    <p className="text-[13px] text-on-muted truncate">{esc.product}</p>
                  </div>
                  <Badge variant="danger" className="shrink-0 ml-auto">{t('escalated')}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-on bg-surface p-4 sm:p-5">
        <h3 className="text-base font-semibold text-on mb-4">{t('recentOrders')}</h3>

        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-on">
                <th className="pb-3 text-left text-[13px] font-medium text-on-muted">Commande</th>
                <th className="pb-3 text-left text-[13px] font-medium text-on-muted">Client</th>
                <th className="pb-3 text-left text-[13px] font-medium text-on-muted">Produit</th>
                <th className="pb-3 text-right text-[13px] font-medium text-on-muted">Total</th>
                <th className="pb-3 text-left text-[13px] font-medium text-on-muted">Statut</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id} className="border-b border-on-light last:border-0 hover:bg-surface-secondary">
                  <td className="py-3 text-sm text-on">{order.id}</td>
                  <td className="py-3 text-sm text-on">{order.customer}</td>
                  <td className="py-3 text-sm text-brand-600">{order.product}</td>
                  <td className="py-3 text-right text-sm text-on">{order.total}</td>
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
            <div key={order.id} className="rounded-lg border border-on-light p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-on">{order.id}</p>
                <Badge variant={statusVariant[order.status]}>{statusLabels[order.status]}</Badge>
              </div>
              <p className="text-sm text-on-secondary">{order.customer}</p>
              <p className="text-xs text-brand-600 mt-1 truncate">{order.product}</p>
              <p className="text-sm font-medium text-on mt-1 text-right">{order.total}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
