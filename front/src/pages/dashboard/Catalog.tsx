import { useState, useEffect, useRef } from 'react'
import { Search, RefreshCw, ImageOff, Loader2, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { api } from '../../lib/api.js'

interface Product {
  id: string
  name: string
  description: string
  price: number
  currency: string
  images: string[]
  variants: any[]
  stockStatus: string
  category: string | null
  createdAt: string
}

interface ProductsResponse {
  data: Product[]
  pagination: { hasNextPage: boolean; nextCursor: string | null }
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
  const [stockFilter, setStockFilter] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [resyncing, setResyncing] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  const fetchProducts = async (cursor?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (stockFilter) params.set('stockStatus', stockFilter)
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
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [search, stockFilter])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleResync = async () => {
    setResyncing(true)
    try {
      await api.get('/store-connection/shopify/sync-all')
      await fetchProducts()
      toast.success('Données resynchronisées')
    } catch {
      toast.error('Erreur lors de la resynchronisation')
    }
    setResyncing(false)
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold text-gray-900">Catalogue</h1>
          <p className="mt-1 text-sm text-gray-500">{products.length} produits synchronisés depuis votre boutique</p>
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
                stockFilter
                  ? 'border-brand-600 bg-brand-50 text-brand-600'
                  : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg z-10 py-1">
                <button
                  onClick={() => { setStockFilter(''); setFilterOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${!stockFilter ? 'text-brand-600 font-medium' : 'text-gray-700'}`}
                >
                  Tous les stocks
                </button>
                {[
                  { value: 'in_stock', label: 'En stock' },
                  { value: 'low_stock', label: 'Stock faible' },
                  { value: 'out_of_stock', label: 'Rupture' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setStockFilter(opt.value); setFilterOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${stockFilter === opt.value ? 'text-brand-600 font-medium' : 'text-gray-700'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="hidden sm:block h-10 w-40 rounded-md border border-gray-300 px-3 text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="">Tous les stocks</option>
            <option value="in_stock">En stock</option>
            <option value="low_stock">Stock faible</option>
            <option value="out_of_stock">Rupture</option>
          </select>
          <Button variant="secondary" className="gap-2" onClick={handleResync} loading={resyncing}>
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Resynchroniser</span>
          </Button>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white">
        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Image</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Produit</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-gray-500">Prix</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Stock</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Catégorie</th>
              </tr>
            </thead>
            <tbody>
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Chargement...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                    Aucun produit trouvé.
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-50 overflow-hidden">
                        {getImageUrl(product.images) ? (
                          <img src={getImageUrl(product.images)!} alt="" className="h-12 w-12 object-cover" />
                        ) : (
                          <ImageOff className="h-[18px] w-[18px] text-gray-400" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{product.name}</p>
                      <p className="truncate text-xs text-gray-500 max-w-[240px]">{product.description}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">{product.price.toLocaleString('fr-FR')} DA</td>
                    <td className="px-4 py-3">
                      <Badge variant={stockVariants[product.stockStatus] || 'neutral'}>
                        {stockLabels[product.stockStatus] || product.stockStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{product.category || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden">
          {loading && products.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Chargement...
            </div>
          ) : products.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              Aucun produit trouvé.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {products.map((product) => (
                <div key={product.id} className="p-4 flex gap-3">
                  <div className="shrink-0 flex h-14 w-14 items-center justify-center rounded-md bg-gray-50 overflow-hidden">
                    {getImageUrl(product.images) ? (
                      <img src={getImageUrl(product.images)!} alt="" className="h-14 w-14 object-cover" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                    <p className="text-xs text-gray-500 truncate">{product.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <p className="text-sm font-medium text-gray-900">{product.price.toLocaleString('fr-FR')} DA</p>
                      <Badge variant={stockVariants[product.stockStatus] || 'neutral'}>
                        {stockLabels[product.stockStatus] || product.stockStatus}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {hasMore && (
          <div className="p-3 text-center border-t border-gray-100">
            <Button variant="ghost" size="sm" onClick={() => fetchProducts(nextCursor!)} loading={loading}>
              Charger plus
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
