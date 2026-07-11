import { useState, useEffect } from 'react'
import { AlertTriangle, Loader2, CheckCircle2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { api } from '../../lib/api.js'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('escalations')

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
      toast.success(t('resolved'))
    } catch {
      toast.error(t('resolveError'))
    }
    setResolvingId(null)
  }

  const handleResolveAll = async () => {
    setResolvingAll(true)
    try {
      await api.post('/escalations/resolve-all', {})
      setEscalations([])
      toast.success(t('allResolved'))
    } catch {
      toast.error(t('resolveError'))
    }
    setResolvingAll(false)
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on">{t('title')}</h1>
          <p className="mt-1 text-sm text-on-muted">
            {t('openCount', { count: escalations.length })}
          </p>
        </div>
        {escalations.length > 0 && (
          <Button variant="secondary" onClick={handleResolveAll} loading={resolvingAll}>
            {t('resolveAll')}
          </Button>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-on bg-surface">
        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-on">
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">{t('columns.client')}</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">{t('columns.lastMessage')}</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">{t('columns.status')}</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-on-muted">{t('columns.since')}</th>
                <th className="px-4 py-3 text-center text-[13px] font-medium text-on-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && escalations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-on-muted">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    {t('loading', { ns: 'common' })}
                  </td>
                </tr>
              ) : escalations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-on-muted">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    {t('empty')}
                    <p className="mt-1">{t('emptyDescription')}</p>
                  </td>
                </tr>
              ) : (
                escalations.map((esc) => (
                  <tr key={esc.id} className="border-b border-on-light last:border-0 hover:bg-surface-secondary">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-on">{esc.customer.name || "—"}</p>
                      <p className="text-xs text-on-muted">{esc.customer.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-on-secondary truncate max-w-[280px]">
                        {esc.messages[0]?.content || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={esc.takenOverByHuman ? "info" : "warning"}>
                        {esc.takenOverByHuman ? t('status.takenOver') : t('status.pending')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-on-muted">
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
                          {t('resolve')}
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
            <div className="px-4 py-12 text-center text-sm text-on-muted">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              {t('loading', { ns: 'common' })}
            </div>
          ) : escalations.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-on-muted">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              {t('empty')}
              <p className="mt-1">{t('emptyDescription')}</p>
            </div>
          ) : (
            <div className="divide-y divide-on-light">
              {escalations.map((esc) => (
                <div key={esc.id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-on">{esc.customer.name || "—"}</p>
                    <Badge variant={esc.takenOverByHuman ? "info" : "warning"}>
                      {esc.takenOverByHuman ? t('status.takenOver') : t('status.pending')}
                    </Badge>
                  </div>
                  <p className="text-xs text-on-muted">{esc.customer.phone}</p>
                  {esc.messages[0]?.content && (
                    <p className="text-sm text-on-secondary mt-1.5 truncate">{esc.messages[0].content}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-on-faint">{esc.escalatedAt ? timeAgo(esc.escalatedAt) : "—"}</span>
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
                        {t('resolve')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {hasMore && (
          <div className="p-3 text-center border-t border-on-light">
            <Button variant="ghost" size="sm" onClick={() => fetchEscalations(nextCursor!)} loading={loading}>
              {t('loadMore', { ns: 'common' })}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
