import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader2, Package, MessageCircle, Check, XCircle, Pause, Play, Hash, Truck } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.js'
import { SelectionBar } from '../../components/ui/SelectionBar.js'
import { TrackingModal } from '../../components/ui/TrackingModal.js'
import { ProviderShipModal } from '../../components/ui/ProviderShipModal.js'
import { FilterDropdown } from '../../components/ui/FilterDropdown.js'
import { DateRangeFilter } from '../../components/ui/DateRangeFilter.js'
import { DropdownMenu, DropdownMenuItem } from '../../components/ui/DropdownMenu.js'
import { api } from '../../lib/api.js'
import { useTranslation } from 'react-i18next'
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
  conversation: { takenOverByHuman: boolean } | null
  createdAt: string
  updatedAt: string
}

interface OrdersResponse {
  data: Order[]
  pagination: {
    total: number
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
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation('orders')

  const allSelected = total > 0 && selectedOrders.size === total

  const toggleSelectAll = async () => {
    if (allSelected) {
      setSelectedOrders(new Set())
    } else {
      try {
        const params = new URLSearchParams()
        if (statusFilters.length > 0) params.set('status', statusFilters.join(','))
        if (search) params.set('search', search)
        if (dateRange) params.set('dateRange', dateRange)
        const res = await api.get<{ ids: string[] }>(`/orders/ids?${params}`)
        setSelectedOrders(new Set(res.ids))
      } catch {
        // fallback: select only loaded
        setSelectedOrders(new Set(orders.map(o => o.id)))
      }
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
  const [trackingIds, setTrackingIds] = useState<string[]>([])
  const [shipProviderOpen, setShipProviderOpen] = useState(false)
  const [shipProviderIds, setShipProviderIds] = useState<string[]>([])
  const [actionLoading, setActionLoading] = useState(false)

  const selectedIds = Array.from(selectedOrders)

  const handleBulkStatus = async (status: string, ids?: string[]) => {
    const targetIds = ids ?? selectedIds
    setActionLoading(true)
    try {
      const res = await api.patch<{ count: number }>('/orders/bulk-status', { orderIds: targetIds, status })
      toast.success(t('toast.bulkStatusSuccess', { count: res.count }))
      if (!ids) setSelectedOrders(new Set())
      fetchOrders()
    } catch {
      toast.error(t('updateError', { ns: 'common' }))
    } finally {
      setActionLoading(false)
    }
  }

  const handleBulkHold = async (hold: boolean, ids?: string[]) => {
    const targetIds = ids ?? selectedIds
    setActionLoading(true)
    try {
      const res = await api.patch<{ count: number }>('/orders/bulk-hold', { orderIds: targetIds, hold })
      toast.success(t('toast.bulkHoldSuccess', { count: res.count }))
      if (!ids) setSelectedOrders(new Set())
    } catch {
      toast.error(t('updateError', { ns: 'common' }))
    } finally {
      setActionLoading(false)
    }
  }

  const handleBulkTracking = async (trackingNumber: string, deliveryProvider: string) => {
    setActionLoading(true)
    try {
      const res = await api.patch<{ count: number }>('/orders/bulk-tracking', { orderIds: trackingIds, trackingNumber, deliveryProvider })
      toast.success(t('toast.trackingSuccess', { count: res.count }))
      setTrackingOpen(false)
      setSelectedOrders(new Set())
      fetchOrders()
    } catch {
      toast.error(t('tracking.error', { ns: 'common' }))
    } finally {
      setActionLoading(false)
    }
  }

  const handleBulkShip = async () => {
    setShipProviderIds(selectedIds)
    setShipProviderOpen(true)
  }

  const getRowActions = (order: Order): DropdownMenuItem[] => {
    const isConfirmed = order.status === 'CONFIRMED'
    const isPaused = order.conversation?.takenOverByHuman ?? false

    return [
      {
        label: t('actions.confirm'),
        icon: <Check className="h-4 w-4" />,
        onClick: () => handleBulkStatus('CONFIRMED', [order.id]),
        disabled: actionLoading || isConfirmed,
      },
      {
        label: t('actions.cancel'),
        icon: <XCircle className="h-4 w-4" />,
        onClick: () => handleBulkStatus('CANCELLED', [order.id]),
        disabled: actionLoading || isConfirmed,
        variant: 'danger',
      },
      ...(isPaused
        ? [{
            label: t('actions.resumeAgent'),
            icon: <Play className="h-4 w-4" />,
            onClick: () => handleBulkHold(false, [order.id]),
            disabled: actionLoading,
          }]
        : [{
            label: t('actions.pauseAgent'),
            icon: <Pause className="h-4 w-4" />,
            onClick: () => handleBulkHold(true, [order.id]),
            disabled: actionLoading,
          }]
      ),
      {
        label: t('actions.tracking'),
        icon: <Hash className="h-4 w-4" />,
        onClick: () => { setTrackingIds([order.id]); setTrackingOpen(true) },
        disabled: actionLoading,
      },
      ...(order.trackingNumber || order.status !== 'CONFIRMED' ? [] : [{
        label: t('actions.ship'),
        icon: <Truck className="h-4 w-4" />,
        onClick: () => { setShipProviderIds([order.id]); setShipProviderOpen(true) },
        disabled: actionLoading,
      }]),
    ]
  }

  const fetchOrders = async (cursor?: string) => {
    if (!cursor) setLoading(true)
    else setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      if (statusFilters.length > 0) params.set('status', statusFilters.join(','))
      if (search) params.set('search', search)
      if (dateRange) params.set('dateRange', dateRange)
      if (cursor) params.set('cursor', cursor)
      params.set('limit', '20')

      const res = await api.get<OrdersResponse>(`/orders?${params}`)
      if (cursor) {
        setOrders((prev) => [...prev, ...res.data])
      } else {
        setOrders(res.data)
      }
      setHasMore(res.pagination.hasNextPage)
      setNextCursor(res.pagination.nextCursor)
      if (!cursor) setTotal(res.pagination.total)
    } catch {
      if (!cursor) setOrders([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    setSelectedOrders(new Set())
    fetchOrders()
  }, [statusFilters, dateRange])

  useEffect(() => {
    setSelectedOrders(new Set())
    const timer = setTimeout(() => {
      fetchOrders()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const handler = () => {
      fetchOrders()
      toast.success(t('toast.newOrder'))
    }
    window.addEventListener('order:created', handler)
    return () => window.removeEventListener('order:created', handler)
  }, [])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore && nextCursor) {
          fetchOrders(nextCursor)
        }
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, nextCursor])

  return (
    <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="shrink-0 flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold text-on">{t('title')}</h1>
            <p className="mt-1 text-sm text-on-muted">{t('subtitle', { count: total })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-faint" />
            <input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full h-10 rounded-md border border-on bg-surface text-on pl-[38px] pr-[10px] py-[10px] text-sm placeholder:text-on-faint focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
            />
          </div>
          <FilterDropdown
            options={[
              { value: 'CONFIRMED', label: t('placeholders.confirmed') },
              { value: 'PENDING', label: t('placeholders.pending') },
              { value: 'CANCELLED', label: t('placeholders.cancelled') },
              { value: 'SHIPPED', label: t('placeholders.shipped') },
              { value: 'DELIVERED', label: t('placeholders.delivered') },
            ]}
            selected={statusFilters}
            onChange={setStatusFilters}
            label={t('filters.status')}
            placeholder={t('filters.allStatuses')}
          />
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-on bg-surface">
        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-on">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-on accent-green-600 focus:ring-brand-600"
                  />
                </th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">{t('columns.client')}</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">{t('columns.product')}</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-on-muted">{t('columns.amount')}</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">{t('columns.address')}</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">{t('columns.tracking')}</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">{t('filters.status')}</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">{t('columns.date')}</th>
                <th className="px-4 py-3 text-center text-[13px] font-medium text-on-muted">{t('actions.openWhatsApp')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-on-muted">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    {t('loading', { ns: 'common' })}
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-on-muted">
                    <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    {t('noResults', { ns: 'common' })}
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className={`border-b border-on-light last:border-0 hover:bg-surface-secondary ${selectedOrders.has(order.id) ? 'bg-green-50/80 dark:bg-green-900/20' : ''}`}>
                    <td className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedOrders.has(order.id)}
                        onChange={() => toggleSelect(order.id)}
                        className="h-4 w-4 rounded border-on accent-green-600 focus:ring-brand-600"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-on">{order.customerName}</p>
                      <p className="text-xs text-on-muted">{order.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <p className="text-sm text-on truncate">{order.productName}</p>
                      <p className="text-xs text-on-muted">x{order.quantity}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-on">{order.totalAmount.toLocaleString('fr-FR')} DA</td>
                    <td className="px-4 py-3 text-sm text-on-muted">
                      {order.wilaya}
                      {order.commune && <span>, {order.commune}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {order.trackingNumber ? (
                        <span className="text-brand-600 font-medium">{order.trackingNumber}</span>
                      ) : (
                        <span className="text-on-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[order.status] || 'neutral'}>
                        {statusLabels[order.status] || order.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-on-muted">
                      {new Date(order.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <a
                          href={formatWhatsAppUrl(order.customerPhone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-on-faint hover:text-green-600 hover:bg-green-50 transition-colors"
                          title="Ouvrir WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                        <DropdownMenu items={getRowActions(order)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden">
          {loading && orders.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-on-muted">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              {t('loading', { ns: 'common' })}
            </div>
          ) : orders.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-on-muted">
              <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              {t('noResults', { ns: 'common' })}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {orders.map((order) => (
                <div key={order.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-on">{order.customerName}</p>
                      <p className="text-xs text-on-muted">{order.customerPhone}</p>
                    </div>
                    <Badge variant={statusVariant[order.status] || 'neutral'}>
                      {statusLabels[order.status] || order.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-on-secondary truncate">{order.productName} x{order.quantity}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium text-on">{order.totalAmount.toLocaleString('fr-FR')} DA</p>
                      <span className="text-xs text-on-faint">{order.wilaya}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <a
                        href={formatWhatsAppUrl(order.customerPhone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-on-faint hover:text-green-600 hover:bg-green-50 transition-colors"
                        title="Ouvrir WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                      <DropdownMenu items={getRowActions(order)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {hasMore && (
          <div ref={sentinelRef} className="h-1">
            {loadingMore && (
              <div className="p-3 text-center">
                <Loader2 className="h-4 w-4 animate-spin mx-auto text-on-faint" />
              </div>
            )}
          </div>
        )}
      </div>

      <SelectionBar
        count={selectedOrders.size}
        onClear={() => setSelectedOrders(new Set())}
        actions={[
          {
            label: t('actions.confirm'),
            icon: <Check className="h-4 w-4" />,
            onClick: () => handleBulkStatus('CONFIRMED'),
            disabled: actionLoading,
          },
          {
            label: t('actions.cancel'),
            icon: <XCircle className="h-4 w-4" />,
            onClick: () => handleBulkStatus('CANCELLED'),
            disabled: actionLoading,
            variant: 'danger',
          },
          {
            label: t('actions.pauseAgent'),
            icon: <Pause className="h-4 w-4" />,
            onClick: () => handleBulkHold(true),
            disabled: actionLoading,
          },
          {
            label: t('actions.resumeAgent'),
            icon: <Play className="h-4 w-4" />,
            onClick: () => handleBulkHold(false),
            disabled: actionLoading,
          },
          {
            label: t('actions.tracking'),
            icon: <Hash className="h-4 w-4" />,
            onClick: () => { setTrackingIds(selectedIds); setTrackingOpen(true) },
            disabled: actionLoading,
          },
          {
            label: t('actions.ship'),
            icon: <Truck className="h-4 w-4" />,
            onClick: handleBulkShip,
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

      <ProviderShipModal
        open={shipProviderOpen}
        onClose={() => setShipProviderOpen(false)}
        orderIds={shipProviderIds}
        onComplete={() => { setSelectedOrders(new Set()); fetchOrders() }}
      />
    </div>
  )
}
