import { useState } from 'react'
import { Search, RefreshCw, ImageOff } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.js'

interface Product {
  id: string
  name: string
  description: string
  price: string
  variants: string[]
  stock: 'in_stock' | 'low_stock' | 'out_of_stock'
  lastSynced: string
  image?: string
}

const products: Product[] = [
  { id: '1', name: 'Montre Connectée SmartFit Pro', description: 'Montre connectée avec suivi d\'activité et notifications', price: '12 900', variants: ['Noir', 'Argent'], stock: 'in_stock', lastSynced: '11/06/2026' },
  { id: '2', name: 'Casque Bluetooth Sans Fil', description: 'Casque audio sans fil avec réduction de bruit active', price: '8 900', variants: ['Standard'], stock: 'low_stock', lastSynced: '11/06/2026' },
  { id: '3', name: 'Chargeur Rapide USB-C 65W', description: 'Chargeur rapide compatible avec tous les appareils USB-C', price: '3 500', variants: ['Blanc'], stock: 'in_stock', lastSynced: '11/06/2026' },
  { id: '4', name: 'Enceinte Portable Bluetooth', description: 'Enceinte Bluetooth portable avec son 360°', price: '5 200', variants: ['Noir', 'Bleu'], stock: 'out_of_stock', lastSynced: '11/06/2026' },
  { id: '5', name: 'Support Téléphone Voiture Magnétique', description: 'Support magnétique pour téléphone, fixation sur grille de ventilation', price: '1 800', variants: ['Gris'], stock: 'in_stock', lastSynced: '11/06/2026' },
]

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

export function Catalog() {
  const [search, setSearch] = useState('')
  const [stockFilter, setStockFilter] = useState('all')

  const filtered = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesStock = stockFilter === 'all' || p.stock === stockFilter
    return matchesSearch && matchesStock
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogue</h1>
          <p className="mt-1 text-sm text-gray-500">{products.length} produits synchronisés depuis votre boutique</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-[10px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <RefreshCw className="h-4 w-4" />
          Resynchroniser
        </button>
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
          <option value="all">Tous les stocks</option>
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
              <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Variantes</th>
              <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Stock</th>
              <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Dernière synchro</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-50">
                    <ImageOff className="h-[18px] w-[18px] text-gray-400" />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{product.name}</p>
                  <p className="truncate text-xs text-gray-500 max-w-[240px]">{product.description}</p>
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">{product.price} DA</td>
                <td className="px-4 py-3 text-sm text-gray-500">{product.variants.join(', ')}</td>
                <td className="px-4 py-3">
                  <Badge variant={stockVariants[product.stock]}>{stockLabels[product.stock]}</Badge>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{product.lastSynced}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                  Aucun produit ne correspond à votre recherche.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
