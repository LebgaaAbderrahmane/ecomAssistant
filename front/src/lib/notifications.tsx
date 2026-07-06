import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "./auth.js";
import { api } from "./api.js";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationContextType {
  whatsappStatus: string;
  whatsappConnected: boolean;
  whatsappPhoneNumber: string | null;
  showDisconnectModal: boolean;
  dismissDisconnectModal: () => void;
  suppressDisconnectModal: () => void;
  notifications: Notification[];
  unreadCount: number;
  fetchNotifications: (unreadOnly?: boolean) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [whatsappStatus, setWhatsappStatus] = useState<string>("unknown");
  const [whatsappPhoneNumber, setWhatsappPhoneNumber] = useState<string | null>(null);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const suppressDisconnectRef = useRef(false);

  const fetchNotifications = useCallback(async (unreadOnly = true) => {
    if (!isAuthenticated) return;
    try {
      const res = await api.get<{
        data: Notification[];
        unreadCount: number;
      }>(`/whatsapp/notifications?unread=${unreadOnly}&limit=10`);
      setNotifications(res.data);
      setUnreadCount(res.unreadCount);
    } catch {
      /* ignore */
    }
  }, [isAuthenticated]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await api.post(`/whatsapp/notifications/${id}/read`, {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      /* ignore */
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await api.post("/whatsapp/notifications/read-all", {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  }, []);

  const connectSSE = useCallback(() => {
    if (!isAuthenticated) return;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource("/whatsapp/events", { withCredentials: true });
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "session.status") {
          const newStatus = data.status === "ready" ? "connected" : data.status;
          setWhatsappStatus((prev) => {
            if (prev !== "unknown" && prev !== newStatus) {
              if (newStatus === "disconnected" || newStatus === "logout") {
                if (!suppressDisconnectRef.current) {
                  setShowDisconnectModal(true);
                }
              }
            }
            return newStatus;
          });
          if (data.phoneNumber) {
            setWhatsappPhoneNumber(data.phoneNumber);
          }
        }

        if (data.type === "notification" && data.notification) {
          const notif: Notification = {
            ...data.notification,
            createdAt: data.notification.createdAt,
          };
          setNotifications((prev) => [notif, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }

        reconnectDelay.current = 1000;
      } catch {}
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, 30000);
      reconnectTimeout.current = setTimeout(connectSSE, delay);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      connectSSE();
      fetchNotifications();
    }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [isAuthenticated, connectSSE, fetchNotifications]);

  useEffect(() => {
    const handleExpired = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

  const dismissDisconnectModal = useCallback(() => {
    setShowDisconnectModal(false);
  }, []);

  const suppressDisconnectModal = useCallback(() => {
    suppressDisconnectRef.current = true;
    setTimeout(() => {
      suppressDisconnectRef.current = false;
    }, 2000);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        whatsappStatus,
        whatsappConnected: whatsappStatus === "connected",
        whatsappPhoneNumber,
        showDisconnectModal,
        dismissDisconnectModal,
        suppressDisconnectModal,
        notifications,
        unreadCount,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
