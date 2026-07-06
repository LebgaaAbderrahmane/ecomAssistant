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

interface SessionStatusEvent {
  status: string;
  phoneNumber?: string;
}

interface NotificationContextType {
  whatsappStatus: string;
  whatsappConnected: boolean;
  whatsappPhoneNumber: string | null;
  showDisconnectModal: boolean;
  dismissDisconnectModal: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [whatsappStatus, setWhatsappStatus] = useState<string>("unknown");
  const [whatsappPhoneNumber, setWhatsappPhoneNumber] = useState<string | null>(null);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const previousStatus = useRef<string>("unknown");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);

  const connectSSE = useCallback(() => {
    if (!isAuthenticated) return;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource("/whatsapp/events", { withCredentials: true });
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: SessionStatusEvent = JSON.parse(event.data);
        const newStatus = data.status === "ready" ? "connected" : data.status;

        setWhatsappStatus((prev) => {
          if (prev !== "unknown" && prev !== newStatus) {
            if (newStatus === "disconnected" || newStatus === "logout") {
              setShowDisconnectModal(true);
            }
          }
          return newStatus;
        });

        if (data.phoneNumber) {
          setWhatsappPhoneNumber(data.phoneNumber);
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
  }, [isAuthenticated, connectSSE]);

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

  return (
    <NotificationContext.Provider
      value={{
        whatsappStatus,
        whatsappConnected: whatsappStatus === "connected",
        whatsappPhoneNumber,
        showDisconnectModal,
        dismissDisconnectModal,
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
