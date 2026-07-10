import { useState, useEffect } from 'react'
import { Search, Loader2, Package, MessageCircle, Check, XCircle, Pause, Play, Hash } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { SelectionBar } from '../../components/ui/SelectionBar.js'
import { TrackingModal } from '../../components/ui/TrackingModal.js'
import { FilterDropdown } from '../../components/ui/FilterDropdown.js'
import { api } from '../../lib/api.js'
import { toast } from 'sonner'

interface Order {
  id: string
  platformOrderId: string
  customerName: string
  customerPhone: string
  customer: { id: string; name: string | null; phone: string }
  wilaya: string
  commune: string | null
  address: string
  productName: string
  quantity: number
  totalAmount: number
  deliveryCost: number
  status: string
  trackingNumber: string | null
  deliveryProvider: string | null
  createdAt: string
  updatedAt: string
}

interface OrdersResponse {
  data: Order[]
  pagination: {
    hasNextPage: boolean
    hasPrevPage: boolean
    nextCursor: string | null
    prevCursor: string | null
  }
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  CONFIRMED: 'success',
  PENDING: 'warning',
  CANCELLED: 'danger',
  PROCESSING: 'info',
  SHIPPED: 'info',
  DELIVERED: 'success',
}

const statusLabels: Record<string, string> = {
  CONFIRMED: 'Confirmée',
  PENDING: 'En attente',
  CANCELLED: 'Annulée',
  PROCESSING: 'En cours',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
}

function formatWhatsAppUrl(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '')
  return `https://wa.me/${clean}`
}

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())

  const allSelected = orders.length > 0 && orders.every(o => selectedOrders.has(o.id))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedOrders(new Set())
    } else {
      setSelectedOrders(new Set(orders.map(o => o.id)))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const [trackingOpen, setTrackingOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const selectedIds = Array.from(selectedOrders)

  const handleBulkStatus = async (status: string) => {
    setActionLoading(true)
    try {
      const res = await api.patch<{ count: number }>('/orders/bulk-status', { orderIds: selectedIds, status })
      toast.success(`${res.count} commande(s) mise(s) à jour`)
      setSelectedOrders(new Set())
      fetchOrders()
    } catch {
      toast.error('Erreur lors de la mise à jour')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBulkHold = async (hold: boolean) => {
    setActionLoading(true)
    try {
      const res = await api.patch<{ count: number }>('/orders/bulk-hold', { orderIds: selectedIds, hold })
      toast.success(`Agent ${hold ? 'mis en pause' : 'repris'} pour ${res.count} commande(s)`)
      setSelectedOrders(new Set())
    } catch {
      toast.error('Erreur lors de la mise à jour')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBulkTracking = async (trackingNumber: string, deliveryProvider: string) => {
    setActionLoading(true)
    try {
      const res = await api.patch<{ count: number }>('/orders/bulk-tracking', { orderIds: selectedIds, trackingNumber, deliveryProvider })
      toast.success(`Suivi attribué à ${res.count} commande(s)`)
      setTrackingOpen(false)
      setSelectedOrders(new Set())
      fetchOrders()
    } catch {
      toast.error("Erreur lors de l'attribution du suivi")
    } finally {
      setActionLoading(false)
    }
  }

  const fetchOrders = async (cursor?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilters.length > 0) params.set('status', statusFilters.join(','))
      if (cursor) params.set('cursor', cursor)
      params.set('limit', '20')

      const res = await api.get<OrdersResponse>(`/orders?${params}`)
      let data = res.data
      if (search) {
        const q = search.toLowerCase()
        data = data.filter(
          (o) =>
            o.customerName.toLowerCase().includes(q) ||
            o.customerPhone.includes(q) ||
            o.productName.toLowerCase().includes(q),
        )
      }
      if (cursor) {
        setOrders((prev) => [...prev, ...data])
      } else {
        setOrders(data)
      }
      setHasMore(res.pagination.hasNextPage)
      setNextCursor(res.pagination.nextCursor)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [statusFilters])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const handler = () => {
      fetchOrders()
      toast.success('Nouvelle commande reçue')
    }
    window.addEventListener('order:created', handler)
    return () => window.removeEventListener('order:created', handler)
  }, [])

  return (
    <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="shrink-0 flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Commandes</h1>
            <p className="mt-1 text-sm text-gray-500">{orders.length} commande{orders.length > 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full h-10 rounded-md border border-gray-300 pl-[38px] pr-[10px] py-[10px] text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
            />
          </div>
          <FilterDropdown
            options={[
              { value: 'CONFIRMED', label: 'Confirmée' },
              { value: 'PENDING', label: 'En attente' },
              { value: 'CANCELLED', label: 'Annulée' },
              { value: 'SHIPPED', label: 'Expédiée' },
              { value: 'DELIVERED', label: 'Livrée' },
            ]}
            selected={statusFilters}
            onChange={setStatusFilters}
            label="Statut"
            placeholder="Tous les statuts"
          />
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white">
        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                  />
                </th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Client</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Produit</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-gray-500">Montant</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Wilaya</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Statut</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 text-center text-[13px] font-medium text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Chargement...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                    <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    Aucune commande trouvée.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${selectedOrders.has(order.id) ? 'bg-brand-50' : ''}`}>
                    <td className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedOrders.has(order.id)}
                        onChange={() => toggleSelect(order.id)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{order.customerName}</p>
                      <p className="text-xs text-gray-500">{order.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <p className="text-sm text-gray-900 truncate">{order.productName}</p>
                      <p className="text-xs text-gray-500">x{order.quantity}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">{order.totalAmount.toLocaleString('fr-FR')} DA</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {order.wilaya}
                      {order.commune && <span>, {order.commune}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[order.status] || 'neutral'}>
                        {statusLabels[order.status] || order.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(order.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <a
                        href={formatWhatsAppUrl(order.customerPhone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                        title="Ouvrir WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden">
          {loading && orders.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Chargement...
            </div>
          ) : orders.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              Aucune commande trouvée.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {orders.map((order) => (
                <div key={order.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{order.customerName}</p>
                      <p className="text-xs text-gray-500">{order.customerPhone}</p>
                    </div>
                    <Badge variant={statusVariant[order.status] || 'neutral'}>
                      {statusLabels[order.status] || order.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700 truncate">{order.productName} x{order.quantity}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium text-gray-900">{order.totalAmount.toLocaleString('fr-FR')} DA</p>
                      <span className="text-xs text-gray-400">{order.wilaya}</span>
                    </div>
                    <a
                      href={formatWhatsAppUrl(order.customerPhone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                      title="Ouvrir WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {hasMore && (
          <div className="p-3 text-center border-t border-gray-100">
            <Button variant="ghost" size="sm" onClick={() => fetchOrders(nextCursor!)} loading={loading}>
              Charger plus
            </Button>
          </div>
        )}
      </div>

      <SelectionBar
        count={selectedOrders.size}
        singularLabel="sélectionnée"
        pluralLabel="sélectionnées"
        onClear={() => setSelectedOrders(new Set())}
        actions={[
          {
            label: 'Confirmer',
            icon: <Check className="h-4 w-4" />,
            onClick: () => handleBulkStatus('CONFIRMED'),
            disabled: actionLoading,
          },
          {
            label: 'Annuler',
            icon: <XCircle className="h-4 w-4" />,
            onClick: () => handleBulkStatus('CANCELLED'),
            disabled: actionLoading,
            variant: 'danger',
          },
          {
            label: 'Pause agent',
            icon: <Pause className="h-4 w-4" />,
            onClick: () => handleBulkHold(true),
            disabled: actionLoading,
          },
          {
            label: 'Reprendre',
            icon: <Play className="h-4 w-4" />,
            onClick: () => handleBulkHold(false),
            disabled: actionLoading,
          },
          {
            label: 'Suivi',
            icon: <Hash className="h-4 w-4" />,
            onClick: () => setTrackingOpen(true),
            disabled: actionLoading,
          },
          {
            label: 'WhatsApp',
            icon: <MessageCircle className="h-4 w-4" />,
            onClick: () => {
              const order = orders.find(o => selectedOrders.has(o.id))
              if (order) window.open(`https://wa.me/${order.customerPhone.replace(/[^0-9]/g, '')}`, '_blank')
            },
            disabled: selectedOrders.size !== 1,
          },
        ]}
      />

      <TrackingModal
        open={trackingOpen}
        onClose={() => setTrackingOpen(false)}
        onConfirm={handleBulkTracking}
        loading={actionLoading}
      />
    </div>
  )
}
