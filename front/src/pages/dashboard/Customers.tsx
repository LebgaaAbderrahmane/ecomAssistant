import { useState, useEffect, useRef } from 'react'
import { Search, Users, Loader2 } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.js'
import { FilterDropdown } from '../../components/ui/FilterDropdown.js'
import { api } from '../../lib/api.js'
import { toast } from 'sonner'

interface Customer {
  id: string
  name: string | null
  phone: string
  createdAt: string
  _count: { orders: number }
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

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [orderFilters, setOrderFilters] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

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

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="shrink-0 flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
            <p className="mt-1 text-sm text-gray-500">{total} client{total !== 1 ? 's' : ''}</p>
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

      <div className="mt-6 rounded-lg border border-gray-200 bg-white">
        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Client</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Téléphone</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-gray-500">Commandes</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Client depuis</th>
              </tr>
            </thead>
            <tbody>
              {loading && customers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Chargement...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-500">
                    <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    Aucun client trouvé.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{customer.name || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{customer.phone}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant={customer._count.orders > 0 ? "success" : "neutral"}>
                        {customer._count.orders}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(customer.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden">
          {loading && customers.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Chargement...
            </div>
          ) : customers.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              Aucun client trouvé.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {customers.map((customer) => (
                <div key={customer.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{customer.name || "—"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{customer.phone}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={customer._count.orders > 0 ? "success" : "neutral"}>
                      {customer._count.orders} commande{customer._count.orders > 1 ? 's' : ''}
                    </Badge>
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
                <Loader2 className="h-4 w-4 animate-spin mx-auto text-gray-400" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
