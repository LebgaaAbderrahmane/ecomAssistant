import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, Package, MessageCircle, SlidersHorizontal } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { api } from '../../lib/api.js'

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
  confirmed: 'success',
  pending: 'warning',
  cancelled: 'danger',
  processing: 'info',
  shipped: 'info',
  delivered: 'success',
}

const statusLabels: Record<string, string> = {
  confirmed: 'Confirmée',
  pending: 'En attente',
  cancelled: 'Annulée',
  processing: 'En cours',
  shipped: 'Expédiée',
  delivered: 'Livrée',
}

function formatWhatsAppUrl(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '')
  return `https://wa.me/${clean}`
}

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  const fetchOrders = async (cursor?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
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
  }, [statusFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold text-gray-900">Commandes</h1>
          <p className="mt-1 text-sm text-gray-500">{orders.length} commande{orders.length > 1 ? 's' : ''}</p>
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
          <div ref={filterRef} className="relative sm:hidden">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className={`flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
                statusFilter
                  ? 'border-brand-600 bg-brand-50 text-brand-600'
                  : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg z-10 py-1">
                <button
                  onClick={() => { setStatusFilter(''); setFilterOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${!statusFilter ? 'text-brand-600 font-medium' : 'text-gray-700'}`}
                >
                  Tous les statuts
                </button>
                {[
                  { value: 'confirmed', label: 'Confirmée' },
                  { value: 'pending', label: 'En attente' },
                  { value: 'cancelled', label: 'Annulée' },
                  { value: 'shipped', label: 'Expédiée' },
                  { value: 'delivered', label: 'Livrée' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setStatusFilter(opt.value); setFilterOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${statusFilter === opt.value ? 'text-brand-600 font-medium' : 'text-gray-700'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="hidden sm:block h-10 w-40 rounded-md border border-gray-300 px-3 text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="">Tous les statuts</option>
            <option value="confirmed">Confirmée</option>
            <option value="pending">En attente</option>
            <option value="cancelled">Annulée</option>
            <option value="shipped">Expédiée</option>
            <option value="delivered">Livrée</option>
          </select>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white">
        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
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
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Chargement...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                    <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    Aucune commande trouvée.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{order.customerName}</p>
                      <p className="text-xs text-gray-500">{order.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900">{order.productName}</p>
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
                      {new Date(order.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <a
                        href={formatWhatsAppUrl(order.customerPhone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 transition-colors"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
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
                      className="inline-flex items-center gap-1.5 rounded-md bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 transition-colors"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
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
    </div>
  )
}
