import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Inbox,
} from "lucide-react";
import { Badge } from "../../components/ui/Badge.js";
import { Button } from "../../components/ui/Button.js";
import { api } from "../../lib/api.js";
import { useTranslation } from 'react-i18next';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function notifIcon(type: string) {
  if (type.includes("disconnected"))
    return <AlertTriangle className="h-5 w-5 text-red-500" />;
  if (type.includes("reconnected") || type.includes("connected"))
    return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  return <Bell className="h-5 w-5 text-on-faint" />;
}

export function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const { t } = useTranslation('notifications');

  const fetchNotifications = useCallback(
    async (reset = false) => {
      setLoading(true);
      try {
        const offset = reset ? 0 : (nextOffset ?? 0);
        const res = await api.get<{
          data: Notification[];
          unreadCount: number;
          pagination: { hasMore: boolean; nextOffset: number | null };
        }>(
          `/whatsapp/notifications?unread=${unreadOnly}&limit=20&offset=${offset}`,
        );
        if (reset) {
          setNotifications(res.data);
        } else {
          setNotifications((prev) => [...prev, ...res.data]);
        }
        setHasMore(res.pagination.hasMore);
        setNextOffset(res.pagination.nextOffset);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    },
    [unreadOnly, nextOffset],
  );

  useEffect(() => {
    fetchNotifications(true);
  }, [unreadOnly]);

  const handleNotifClick = async (notif: Notification) => {
    if (!notif.read) {
      try {
        await api.post(`/whatsapp/notifications/${notif.id}/read`, {});
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
        );
      } catch {
        /* ignore */
      }
    }
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post("/whatsapp/notifications/read-all", {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on">{t('title')}</h1>
          <p className="mt-1 text-sm text-on-muted">
            {t('subtitle')}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={markAllAsRead}>
          {t('markAllRead')}
        </Button>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => setUnreadOnly(false)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            !unreadOnly
              ? "bg-brand-600 text-white"
              : "text-on-muted hover:bg-gray-100"
          }`}
        >
          {t('tabs.all')}
        </button>
        <button
          onClick={() => setUnreadOnly(true)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            unreadOnly
              ? "bg-brand-600 text-white"
              : "text-on-muted hover:bg-gray-100"
          }`}
        >
          {t('tabs.unread')}
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-on bg-surface">
        {loading && notifications.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-on-muted">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            {t('loading', { ns: 'common' })}
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-on-muted">
            <Inbox className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            {t('empty')}
          </div>
        ) : (
          <>
            {notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleNotifClick(notif)}
                className={`flex w-full items-start gap-4 border-b border-on-light px-4 py-4 text-left hover:bg-surface-secondary transition-colors last:border-0 ${
                  !notif.read ? "bg-brand-50/30" : ""
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {notifIcon(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-sm ${
                        !notif.read
                          ? "font-semibold text-on"
                          : "font-medium text-on-secondary"
                      }`}
                    >
                      {notif.title}
                    </p>
                    {!notif.read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-on-muted">{notif.message}</p>
                  <p className="mt-1 text-xs text-on-faint">
                    {timeAgo(notif.createdAt)}
                  </p>
                </div>
                {notif.link && (
                  <Badge variant="info" className="shrink-0">
                    {t('view')}
                  </Badge>
                )}
              </button>
            ))}
            {hasMore && (
              <div className="p-3 text-center border-t border-on-light">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchNotifications(false)}
                  loading={loading}
                >
                  {t('loadMore', { ns: 'common' })}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
