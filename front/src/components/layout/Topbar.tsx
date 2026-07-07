import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store,
  Settings as SettingsIcon,
  CreditCard,
  LogOut,
  Bell,
  User,
  AlertTriangle,
  CheckCircle2,
  Menu,
} from "lucide-react";
import { useAuth } from "../../lib/auth.js";
import { useNotifications, type Notification } from "../../lib/notifications.js";
import { useMobileMenu } from "../../lib/mobileMenu.js";

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
  if (type.includes("disconnected")) return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (type.includes("reconnected") || type.includes("connected")) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  return <Bell className="h-4 w-4 text-gray-400" />;
}

export function Topbar() {
  const { user, logout } = useAuth();
  const {
    whatsappConnected,
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  const navigate = useNavigate();
  const { open } = useMobileMenu();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node))
        setDropdownOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initial = user?.name?.charAt(0).toUpperCase() || "M";

  const handleNotifClick = (notif: Notification) => {
    markAsRead(notif.id);
    setDropdownOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 lg:ml-[250px] items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-8">
      <div className="flex items-center gap-3">
        <button onClick={open} className="lg:hidden rounded-md p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
          <Store className="h-[18px] w-[18px] hidden sm:block" />
          <span className="truncate max-w-[160px] sm:max-w-none">{user?.shopName || user?.name || "Mon Espace"}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="relative rounded-md p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <Bell className="h-5 w-5" />
            {!whatsappConnected && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
            )}
            {whatsappConnected && unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setDropdownOpen(false)} />
              <div className="fixed left-0 right-0 top-14 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[360px] sm:z-50 rounded-b-lg sm:rounded-lg border border-gray-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    Tout marquer comme lu
                  </button>
                )}
              </div>

              <div className="max-h-[360px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    Aucune notification
                  </div>
                ) : (
                  notifications.slice(0, 8).map((notif) => (
                    <button
                      key={notif.id}
                      onClick={() => handleNotifClick(notif)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                        !notif.read ? "bg-brand-50/50" : ""
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {notifIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${
                            !notif.read ? "font-medium text-gray-900" : "text-gray-700"
                          }`}
                        >
                          {notif.title}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 truncate">
                          {notif.message}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-400">
                          {timeAgo(notif.createdAt)}
                        </p>
                      </div>
                      {!notif.read && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </button>
                  ))
                )}
              </div>

              <div className="border-t border-gray-100 px-4 py-2.5">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate("/dashboard/notifications");
                  }}
                  className="w-full text-center text-xs font-medium text-brand-600 hover:underline"
                >
                  Voir toutes les notifications
                </button>
              </div>
            </div>
            </>
          )}
        </div>

        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white hover:ring-2 hover:ring-brand-300 transition-all"
          >
            {initial}
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setProfileOpen(false)} />
              <div className="fixed left-4 right-4 top-14 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[220px] sm:z-50 rounded-lg border border-gray-200 bg-white shadow-md">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900">
                  {user?.name || "Marchand"}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email || "marchand@email.com"}
                </p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    navigate("/dashboard/profile");
                    setProfileOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-3 px-4 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <User className="h-4 w-4" />
                  Mon profil
                </button>
                <button
                  onClick={() => {
                    navigate("/dashboard/settings");
                    setProfileOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-3 px-4 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <SettingsIcon className="h-4 w-4" />
                  Paramètres
                </button>
                <button
                  onClick={() => {
                    navigate("/dashboard/billing");
                    setProfileOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-3 px-4 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <CreditCard className="h-4 w-4" />
                  Facturation
                </button>
              </div>
              <div className="border-t border-gray-100 py-1">
                <button
                  onClick={() => {
                    logout();
                    setProfileOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-3 px-4 text-sm text-red-600 hover:bg-gray-50"
                >
                  <LogOut className="h-4 w-4" />
                  Déconnexion
                </button>
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
