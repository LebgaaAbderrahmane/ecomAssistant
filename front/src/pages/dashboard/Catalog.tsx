import { useState, useEffect } from 'react'
import { Search, RefreshCw, ImageOff, Loader2 } from 'lucide-react'
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

  const handleResync = async () => {
    setResyncing(true)
    try {
      await api.get('/store-connection/shopify/sync-orders')
      await fetchProducts()
    } catch { /* ignore */ }
    setResyncing(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogue</h1>
          <p className="mt-1 text-sm text-gray-500">{products.length} produits synchronisés depuis votre boutique</p>
        </div>
        <Button variant="secondary" className="gap-2" onClick={handleResync} loading={resyncing}>
          <RefreshCw className="h-4 w-4" />
          Resynchroniser
        </Button>
      </div>

      <div className="mt-6 flex gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Rechercher des produits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full h-10 rounded-md border border-gray-300 pl-[38px] pr-[10px] py-[10px] text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
          />
        </div>
        <select
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value)}
          className="h-10 w-40 rounded-md border border-gray-300 px-3 text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600"
        >
          <option value="">Tous les stocks</option>
          <option value="in_stock">En stock</option>
          <option value="low_stock">Stock faible</option>
          <option value="out_of_stock">Rupture</option>
        </select>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white">
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
