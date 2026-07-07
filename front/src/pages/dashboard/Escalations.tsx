import { useState, useEffect } from 'react'
import { AlertTriangle, Loader2, CheckCircle2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { api } from '../../lib/api.js'

interface Escalation {
  id: string
  status: string
  escalatedAt: string
  takenOverByHuman: boolean
  customerPhone: string
  customer: { id: string; name: string | null; phone: string }
  messages: { content: string; createdAt: string }[]
}

interface EscalationsResponse {
  data: Escalation[]
  pagination: {
    hasNextPage: boolean
    hasPrevPage: boolean
    nextCursor: string | null
    prevCursor: string | null
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return "à l'instant"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days}j`
}

function formatWhatsAppUrl(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '')
  return `https://wa.me/${clean}`
}

export function Escalations() {
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [loading, setLoading] = useState(true)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [resolvingAll, setResolvingAll] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const fetchEscalations = async (cursor?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (cursor) params.set('cursor', cursor)
      params.set('limit', '20')

      const res = await api.get<EscalationsResponse>(`/escalations?${params}`)
      if (cursor) {
        setEscalations((prev) => [...prev, ...res.data])
      } else {
        setEscalations(res.data)
      }
      setHasMore(res.pagination.hasNextPage)
      setNextCursor(res.pagination.nextCursor)
    } catch {
      setEscalations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEscalations()
  }, [])

  const handleResolve = async (id: string) => {
    setResolvingId(id)
    try {
      await api.post(`/escalations/${id}/resolve`, {})
      setEscalations((prev) => prev.filter((e) => e.id !== id))
      toast.success('Escalade résolue')
    } catch {
      toast.error('Erreur lors de la résolution')
    }
    setResolvingId(null)
  }

  const handleResolveAll = async () => {
    setResolvingAll(true)
    try {
      await api.post('/escalations/resolve-all', {})
      setEscalations([])
      toast.success('Toutes les escalades ont été résolues')
    } catch {
      toast.error('Erreur lors de la résolution')
    }
    setResolvingAll(false)
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Escalades</h1>
          <p className="mt-1 text-sm text-gray-500">
            {escalations.length} ouverte{escalations.length > 1 ? 's' : ''}
          </p>
        </div>
        {escalations.length > 0 && (
          <Button variant="secondary" onClick={handleResolveAll} loading={resolvingAll}>
            Tout marquer comme résolu
          </Button>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white">
        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Client</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Dernier message</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Statut</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-gray-500">Depuis</th>
                <th className="px-4 py-3 text-center text-[13px] font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && escalations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Chargement...
                  </td>
                </tr>
              ) : escalations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    Aucune escalade
                    <p className="mt-1">Les conversations nécessitant votre attention apparaîtront ici</p>
                  </td>
                </tr>
              ) : (
                escalations.map((esc) => (
                  <tr key={esc.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{esc.customer.name || "—"}</p>
                      <p className="text-xs text-gray-500">{esc.customer.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700 truncate max-w-[280px]">
                        {esc.messages[0]?.content || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={esc.takenOverByHuman ? "info" : "warning"}>
                        {esc.takenOverByHuman ? "Pris en main" : "En attente"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {esc.escalatedAt ? timeAgo(esc.escalatedAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <a
                          href={formatWhatsAppUrl(esc.customerPhone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 transition-colors"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResolve(esc.id)}
                          loading={resolvingId === esc.id}
                        >
                          Résoudre
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden">
          {loading && escalations.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Chargement...
            </div>
          ) : escalations.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              Aucune escalade
              <p className="mt-1">Les conversations nécessitant votre attention apparaîtront ici</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {escalations.map((esc) => (
                <div key={esc.id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">{esc.customer.name || "—"}</p>
                    <Badge variant={esc.takenOverByHuman ? "info" : "warning"}>
                      {esc.takenOverByHuman ? "Pris en main" : "En attente"}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">{esc.customer.phone}</p>
                  {esc.messages[0]?.content && (
                    <p className="text-sm text-gray-700 mt-1.5 truncate">{esc.messages[0].content}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">{esc.escalatedAt ? timeAgo(esc.escalatedAt) : "—"}</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={formatWhatsAppUrl(esc.customerPhone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 transition-colors"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResolve(esc.id)}
                        loading={resolvingId === esc.id}
                      >
                        Résoudre
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {hasMore && (
          <div className="p-3 text-center border-t border-gray-100">
            <Button variant="ghost" size="sm" onClick={() => fetchEscalations(nextCursor!)} loading={loading}>
              Charger plus
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
