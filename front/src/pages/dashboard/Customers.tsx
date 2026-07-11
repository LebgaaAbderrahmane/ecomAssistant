import { useState, useEffect, useRef } from 'react'
import { Search, Users, Loader2, MessageCircle, Ban, Unlock, ShoppingBag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge.js'
import { FilterDropdown } from '../../components/ui/FilterDropdown.js'
import { DropdownMenu, DropdownMenuItem } from '../../components/ui/DropdownMenu.js'
import { SelectionBar } from '../../components/ui/SelectionBar.js'
import { api } from '../../lib/api.js'
import { toast } from 'sonner'

interface Customer {
  id: string
  name: string | null
  phone: string
  blocked: boolean
  createdAt: string
  _count: { orders: number }
  confirmedOrders: number
  cancelledOrders: number
}

interface CustomersResponse {
  data: Customer[]
  pagination: {
    total: number
    hasNextPage: boolean
    hasPrevPage: boolean
    nextCursor: string | null
    prevCursor: string | null
  }
}

function formatWhatsAppUrl(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '')
  return `https://wa.me/${clean}`
}

export function Customers() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [orderFilters, setOrderFilters] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const allSelected = total > 0 && selectedCustomers.size === total

  const toggleSelectAll = async () => {
    if (allSelected) {
      setSelectedCustomers(new Set())
    } else {
      try {
        const params = new URLSearchParams()
        if (search) params.set('search', search)
        if (orderFilters.length > 0) params.set('orderFilter', orderFilters.join(','))
        const res = await api.get<{ ids: string[] }>(`/customers/ids?${params}`)
        setSelectedCustomers(new Set(res.ids))
      } catch {
        setSelectedCustomers(new Set(customers.map(c => c.id)))
      }
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedCustomers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkBlock = async (blocked: boolean, ids?: string[]) => {
    const targetIds = ids ?? Array.from(selectedCustomers)
    setActionLoading(true)
    try {
      const res = await api.patch<{ count: number }>('/customers/bulk-block', { customerIds: targetIds, blocked })
      toast.success(`${res.count} client(s) ${blocked ? 'bloqué(s)' : 'débloqué(s)'}`)
      if (!ids) setSelectedCustomers(new Set())
      fetchCustomers()
    } catch {
      toast.error('Erreur lors de la mise à jour')
    } finally {
      setActionLoading(false)
    }
  }

  const getRowActions = (customer: Customer): DropdownMenuItem[] => [
    {
      label: 'WhatsApp',
      icon: <MessageCircle className="h-4 w-4" />,
      onClick: () => window.open(formatWhatsAppUrl(customer.phone), '_blank'),
    },
    {
      label: 'Voir commandes',
      icon: <ShoppingBag className="h-4 w-4" />,
      onClick: () => navigate(`/dashboard/orders?search=${encodeURIComponent(customer.phone)}`),
    },
    {
      label: customer.blocked ? 'Débloquer' : 'Bloquer',
      icon: customer.blocked ? <Unlock className="h-4 w-4" /> : <Ban className="h-4 w-4" />,
      onClick: () => handleBulkBlock(!customer.blocked, [customer.id]),
      disabled: actionLoading,
      variant: customer.blocked ? 'default' : 'danger',
    },
  ]

  const fetchCustomers = async (cursor?: string) => {
    if (!cursor) setLoading(true)
    else setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (orderFilters.length > 0) params.set('orderFilter', orderFilters.join(','))
      if (cursor) params.set('cursor', cursor)
      params.set('limit', '20')

      const res = await api.get<CustomersResponse>(`/customers?${params}`)
      if (cursor) {
        setCustomers((prev) => [...prev, ...res.data])
      } else {
        setCustomers(res.data)
      }
      setHasMore(res.pagination.hasNextPage)
      setNextCursor(res.pagination.nextCursor)
      if (!cursor) setTotal(res.pagination.total)
    } catch {
      if (!cursor) setCustomers([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    setSelectedCustomers(new Set())
    fetchCustomers()
  }, [search, orderFilters])

  useEffect(() => {
    const handler = () => {
      fetchCustomers()
      toast.success('Nouvelle commande reçue')
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
          fetchCustomers(nextCursor)
        }
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, nextCursor])

  const selectedIds = Array.from(selectedCustomers)
  const selectedBlockedCount = customers.filter(c => selectedCustomers.has(c.id) && c.blocked).length
  const majorityBlocked = selectedBlockedCount > selectedIds.length / 2

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="shrink-0 flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold text-on">Clients</h1>
            <p className="mt-1 text-sm text-on-muted">{total} client{total !== 1 ? 's' : ''}</p>
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
              { value: 'with_orders', label: 'Avec commandes' },
              { value: 'without_orders', label: 'Sans commandes' },
            ]}
            selected={orderFilters}
            onChange={setOrderFilters}
            label="Clients"
            placeholder="Tous les clients"
          />
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
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">Client</th>
                <th className="px-4 py-3 text-center text-[13px] font-medium text-on-muted">Confirmées</th>
                <th className="px-4 py-3 text-center text-[13px] font-medium text-on-muted">Annulées</th>
                <th className="px-4 py-3 text-center text-[13px] font-medium text-on-muted">Total</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">Client depuis</th>
                <th className="px-4 py-3 text-center text-[13px] font-medium text-on-muted">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-on-muted">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Chargement...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-on-muted">
                    <Users className="h-8 w-8 mx-auto mb-2 text-on" />
                    Aucun client trouvé.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className={`border-b border-on-light last:border-0 hover:bg-surface-secondary ${selectedCustomers.has(customer.id) ? 'bg-green-50/80 dark:bg-brand-900/20' : ''}`}>
                    <td className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedCustomers.has(customer.id)}
                        onChange={() => toggleSelect(customer.id)}
                        className="h-4 w-4 rounded border-on accent-green-600 focus:ring-brand-600"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-on">{customer.name || '—'}</p>
                      <p className="text-xs text-on-muted">{customer.phone}</p>
                      {customer.blocked && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-red-600">
                          <Ban className="h-3 w-3" /> Bloqué
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={customer.confirmedOrders > 0 ? 'success' : 'neutral'}>
                        {customer.confirmedOrders}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={customer.cancelledOrders > 0 ? 'danger' : 'neutral'}>
                        {customer.cancelledOrders}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={customer._count.orders > 0 ? 'info' : 'neutral'}>
                        {customer._count.orders}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-on-muted">
                      {new Date(customer.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <DropdownMenu items={getRowActions(customer)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden">
          {loading && customers.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-on-muted">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Chargement...
            </div>
          ) : customers.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-on-muted">
              <Users className="h-8 w-8 mx-auto mb-2 text-on" />
              Aucun client trouvé.
            </div>
          ) : (
            <div className="divide-y divide-on-light">
              {customers.map((customer) => (
                <div key={customer.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-on">{customer.name || '—'}</p>
                      <p className="text-xs text-on-muted">{customer.phone}</p>
                      {customer.blocked && (
                        <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-medium text-red-600">
                          <Ban className="h-3 w-3" /> Bloqué
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={customer.confirmedOrders > 0 ? 'success' : 'neutral'}>
                          {customer.confirmedOrders} ✓
                        </Badge>
                        <Badge variant={customer.cancelledOrders > 0 ? 'danger' : 'neutral'}>
                          {customer.cancelledOrders} ✗
                        </Badge>
                      </div>
                      <DropdownMenu items={getRowActions(customer)} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-on-muted">
                      {customer._count.orders} commande{customer._count.orders !== 1 ? 's' : ''} · {new Date(customer.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
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
        count={selectedCustomers.size}
        singularLabel="sélectionné"
        pluralLabel="sélectionnés"
        onClear={() => setSelectedCustomers(new Set())}
        actions={[
          {
            label: majorityBlocked ? 'Débloquer' : 'Bloquer',
            icon: majorityBlocked ? <Unlock className="h-4 w-4" /> : <Ban className="h-4 w-4" />,
            onClick: () => handleBulkBlock(!majorityBlocked),
            disabled: actionLoading,
            variant: majorityBlocked ? 'default' : 'danger',
          },
          {
            label: 'WhatsApp',
            icon: <MessageCircle className="h-4 w-4" />,
            onClick: () => {
              const customer = customers.find(c => selectedCustomers.has(c.id))
              if (customer) window.open(formatWhatsAppUrl(customer.phone), '_blank')
            },
            disabled: selectedCustomers.size !== 1,
          },
        ]}
      />
    </div>
  )
}
