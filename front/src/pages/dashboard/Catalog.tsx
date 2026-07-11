import { useState, useEffect, useRef } from 'react'
import { Search, ImageOff, Loader2, ExternalLink, Bot, BotOff } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '../../components/ui/Badge.js'
import { FilterDropdown } from '../../components/ui/FilterDropdown.js'
import { DropdownMenu, DropdownMenuItem } from '../../components/ui/DropdownMenu.js'
import { SelectionBar } from '../../components/ui/SelectionBar.js'
import { api } from '../../lib/api.js'
import { useTranslation } from 'react-i18next'

interface Product {
  id: string
  platformProductId: string
  name: string
  description: string
  price: number
  currency: string
  images: string[]
  variants: any[]
  stockStatus: string
  category: string | null
  agentEnabled: boolean
  shopDomain: string | null
  createdAt: string
}

interface ProductsResponse {
  data: Product[]
  pagination: { total: number; hasNextPage: boolean; nextCursor: string | null }
}

const stockLabels: Record<string, string> = {
  in_stock: 'En stock',
  low_stock: 'Stock faible',
  out_of_stock: 'Rupture',
}

const stockVariants: Record<string, 'success' | 'warning' | 'neutral'> = {
  in_stock: 'success',
  low_stock: 'warning',
  out_of_stock: 'neutral',
}

function getImageUrl(images: string[]): string | null {
  if (!images || images.length === 0) return null
  return images[0]
}

export function Catalog() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stockFilters, setStockFilters] = useState<string[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation('catalog')

  const allSelected = total > 0 && selectedProducts.size === total

  const toggleSelectAll = async () => {
    if (allSelected) {
      setSelectedProducts(new Set())
    } else {
      try {
        const params = new URLSearchParams()
        if (search) params.set('search', search)
        if (stockFilters.length > 0) params.set('stockStatus', stockFilters.join(','))
        const res = await api.get<{ ids: string[] }>(`/products/ids?${params}`)
        setSelectedProducts(new Set(res.ids))
      } catch {
        setSelectedProducts(new Set(products.map(p => p.id)))
      }
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkAgent = async (agentEnabled: boolean, ids?: string[]) => {
    const targetIds = ids ?? Array.from(selectedProducts)
    setActionLoading(true)
    try {
      const res = await api.patch<{ count: number }>('/products/bulk-agent', { productIds: targetIds, agentEnabled })
      toast.success(agentEnabled ? t('toast.agentEnabled', { count: res.count }) : t('toast.agentDisabled', { count: res.count }))
      if (!ids) setSelectedProducts(new Set())
      fetchProducts()
    } catch {
      toast.error(t('updateError', { ns: 'common' }))
    } finally {
      setActionLoading(false)
    }
  }

  const getRowActions = (product: Product): DropdownMenuItem[] => [
    {
      label: t('actions.viewOnShopify'),
      icon: <ExternalLink className="h-4 w-4" />,
      onClick: () => {
        if (product.shopDomain) {
          window.open(`https://${product.shopDomain}/admin/products/${product.platformProductId}`, '_blank')
        }
      },
      disabled: !product.shopDomain,
    },
    {
      label: product.agentEnabled ? t('actions.disableAgent') : t('actions.enableAgent'),
      icon: product.agentEnabled ? <BotOff className="h-4 w-4" /> : <Bot className="h-4 w-4" />,
      onClick: () => handleBulkAgent(!product.agentEnabled, [product.id]),
      disabled: actionLoading,
    },
  ]

  const fetchProducts = async (cursor?: string) => {
    if (!cursor) setLoading(true)
    else setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (stockFilters.length > 0) params.set('stockStatus', stockFilters.join(','))
      if (cursor) params.set('cursor', cursor)
      params.set('limit', '20')

      const res = await api.get<ProductsResponse>(`/products?${params}`)
      if (cursor) {
        setProducts((prev) => [...prev, ...res.data])
      } else {
        setProducts(res.data)
      }
      setHasMore(res.pagination.hasNextPage)
      setNextCursor(res.pagination.nextCursor)
      if (!cursor) setTotal(res.pagination.total)
    } catch {
      if (!cursor) setProducts([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    setSelectedProducts(new Set())
    fetchProducts()
  }, [search, stockFilters])

  useEffect(() => {
    const handler = () => {
      fetchProducts()
      toast.success(t('toast.synced'))
    }
    window.addEventListener('products:synced', handler)
    return () => window.removeEventListener('products:synced', handler)
  }, [])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore && nextCursor) {
          fetchProducts(nextCursor)
        }
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, nextCursor])

  const selectedIds = Array.from(selectedProducts)
  const selectedAgentDisabledCount = products.filter(p => selectedProducts.has(p.id) && !p.agentEnabled).length
  const majorityAgentDisabled = selectedAgentDisabledCount > selectedIds.length / 2

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
              { value: 'in_stock', label: t('stock.inStock') },
              { value: 'low_stock', label: t('stock.lowStock') },
              { value: 'out_of_stock', label: t('stock.outOfStock') },
            ]}
            selected={stockFilters}
            onChange={setStockFilters}
            label={t('stock.label')}
            placeholder={t('stock.allStocks')}
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
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted w-16">{t('columns.image')}</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted max-w-[200px]">{t('columns.product')}</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-on-muted w-24">{t('columns.price')}</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted w-28">{t('columns.stock')}</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted w-32">{t('columns.category')}</th>
                <th className="px-4 py-3 text-center text-[13px] font-medium text-on-muted w-10">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-on-muted">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    {t('loading', { ns: 'common' })}
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-on-muted">
                    <ImageOff className="h-8 w-8 mx-auto mb-2 text-on-faint" />
                    {t('noResults', { ns: 'common' })}
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className={`border-b border-on-light last:border-0 hover:bg-surface-secondary ${selectedProducts.has(product.id) ? 'bg-green-50/80 dark:bg-green-900/20' : ''}`}>
                    <td className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => toggleSelect(product.id)}
                        className="h-4 w-4 rounded border-on accent-green-600 focus:ring-brand-600"
                      />
                    </td>
                    <td className="px-4 py-3 w-16">
                      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-surface-secondary overflow-hidden">
                        {getImageUrl(product.images) ? (
                          <img src={getImageUrl(product.images)!} alt="" className="h-12 w-12 object-cover" />
                        ) : (
                          <ImageOff className="h-[18px] w-[18px] text-on-faint" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="text-sm font-medium text-on truncate">{product.name}</p>
                      <p className="truncate text-xs text-on-muted max-w-[200px]">{product.description}</p>
                      {!product.agentEnabled && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-amber-600">
                          <BotOff className="h-3 w-3" /> {t('agentDisabled')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-on w-24">{product.price.toLocaleString('fr-FR')} DA</td>
                    <td className="px-4 py-3 w-28">
                      <Badge variant={stockVariants[product.stockStatus] || 'neutral'}>
                        {stockLabels[product.stockStatus] || product.stockStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-on-muted w-32">{product.category || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <DropdownMenu items={getRowActions(product)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden">
          {loading && products.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-on-muted">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              {t('loading', { ns: 'common' })}
            </div>
          ) : products.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-on-muted">
              <ImageOff className="h-8 w-8 mx-auto mb-2 text-on-faint" />
              {t('noResults', { ns: 'common' })}
            </div>
          ) : (
            <div className="divide-y divide-on-light">
              {products.map((product) => (
                <div key={product.id} className="p-4 flex gap-3">
                  <div className="shrink-0 flex h-14 w-14 items-center justify-center rounded-md bg-surface-secondary overflow-hidden">
                    {getImageUrl(product.images) ? (
                      <img src={getImageUrl(product.images)!} alt="" className="h-14 w-14 object-cover" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-on-faint" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 max-w-[200px]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-on truncate">{product.name}</p>
                        <p className="text-xs text-on-muted truncate">{product.description}</p>
                      </div>
                      <DropdownMenu items={getRowActions(product)} />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <p className="text-sm font-medium text-on">{product.price.toLocaleString('fr-FR')} DA</p>
                      <Badge variant={stockVariants[product.stockStatus] || 'neutral'}>
                        {stockLabels[product.stockStatus] || product.stockStatus}
                      </Badge>
                      {!product.agentEnabled && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-600">
                          <BotOff className="h-3 w-3" />
                        </span>
                      )}
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
        count={selectedProducts.size}
        onClear={() => setSelectedProducts(new Set())}
        actions={[
          {
            label: majorityAgentDisabled ? t('actions.enableAgent') : t('actions.disableAgent'),
            icon: majorityAgentDisabled ? <Bot className="h-4 w-4" /> : <BotOff className="h-4 w-4" />,
            onClick: () => handleBulkAgent(majorityAgentDisabled),
            disabled: actionLoading,
          },
          {
            label: t('actions.viewOnShopify'),
            icon: <ExternalLink className="h-4 w-4" />,
            onClick: () => {
              const product = products.find(p => selectedProducts.has(p.id))
              if (product?.shopDomain) {
                window.open(`https://${product.shopDomain}/admin/products/${product.platformProductId}`, '_blank')
              }
            },
            disabled: selectedProducts.size !== 1 || !products.find(p => selectedProducts.has(p.id))?.shopDomain,
          },
        ]}
      />
    </div>
  )
}
