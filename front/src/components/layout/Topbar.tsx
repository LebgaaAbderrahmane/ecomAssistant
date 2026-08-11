import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  Sun,
  Moon,
  Monitor,
  Palette,
  Globe,
} from "lucide-react";
import { useAuth } from "../../lib/auth.js";
import { useNotifications, type Notification } from "../../lib/notifications.js";
import { useMobileMenu } from "../../lib/mobileMenu.js";
import { useTheme } from "../../lib/theme.js";

const langOptions = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
]

function timeAgo(dateStr: string, t: any): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return t('timeAgo.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('timeAgo.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('timeAgo.hours', { count: hours });
  const days = Math.floor(hours / 24);
  return t('timeAgo.days', { count: days });
}

function notifIcon(type: string) {
  if (type.includes("disconnected")) return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (type.includes("reconnected") || type.includes("connected")) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  return <Bell className="h-4 w-4 text-on-faint" />;
}

export function Topbar() {
  const { t, i18n } = useTranslation('layout');
  const { t: tc } = useTranslation('common');
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
  const { theme, setTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node))
        setDropdownOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
      if (themeRef.current && !themeRef.current.contains(e.target as Node))
        setThemeOpen(false);
      if (langRef.current && !langRef.current.contains(e.target as Node))
        setLangOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initial = user?.name?.charAt(0).toUpperCase() || "M";
  const currentLang = langOptions.find(l => l.value === i18n.language) || langOptions[0];

  const handleNotifClick = (notif: Notification) => {
    markAsRead(notif.id);
    setDropdownOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const themeLabels: Record<string, string> = {
    light: t('topbar.light'),
    dark: t('topbar.dark'),
    system: t('topbar.system'),
  }

  const themeIcons: Record<string, any> = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 lg:ml-[250px] items-center justify-between border-b border-on bg-surface px-4 sm:px-8">
      <div className="flex items-center gap-3">
        <button onClick={open} className="lg:hidden rounded-md p-1.5 text-on-muted hover:bg-surface-secondary hover:text-on-secondary">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 text-sm font-medium text-on-muted">
          <Store className="h-[18px] w-[18px] hidden sm:block" />
          <span className="truncate max-w-[160px] sm:max-w-none">{user?.shopName || user?.name || t('topbar.mySpace')}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Language toggle */}
        <div ref={langRef} className="relative">
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="rounded-md p-2 text-on-muted hover:bg-surface-secondary hover:text-on-secondary transition-colors"
            title="Language"
          >
            <Globe className="h-5 w-5" />
          </button>

          {langOpen && (
            <>
              <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setLangOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-on bg-surface shadow-lg z-50 py-1">
                {langOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { i18n.changeLanguage(opt.value); setLangOpen(false) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      i18n.language === opt.value
                        ? 'text-brand-600 font-medium bg-brand-50'
                        : 'text-on-secondary hover:bg-surface-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Theme toggle */}
        <div ref={themeRef} className="relative">
          <button
            onClick={() => setThemeOpen(!themeOpen)}
            className="rounded-md p-2 text-on-muted hover:bg-surface-secondary hover:text-on-secondary transition-colors"
            title={t('topbar.theme')}
          >
            <Palette className="h-5 w-5" />
          </button>

          {themeOpen && (
            <>
              <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setThemeOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-on bg-surface shadow-lg z-50 py-1">
                {(['light', 'dark', 'system'] as const).map(val => {
                  const Icon = themeIcons[val]
                  return (
                    <button
                      key={val}
                      onClick={() => { setTheme(val); setThemeOpen(false) }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                        theme === val
                          ? 'text-brand-600 font-medium bg-brand-50'
                          : 'text-on-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {themeLabels[val]}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Notifications */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="relative rounded-md p-2 text-on-muted hover:bg-surface-secondary hover:text-on-secondary transition-colors"
          >
            <Bell className="h-5 w-5" />
            {!whatsappConnected && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-surface" />
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
              <div className="fixed left-0 right-0 top-14 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[360px] sm:z-50 rounded-b-lg sm:rounded-lg border border-on bg-surface shadow-lg">
              <div className="flex items-center justify-between border-b border-on-light px-4 py-3">
                <h3 className="text-sm font-semibold text-on">
                  {t('topbar.notifications')}
                </h3>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    {t('topbar.markAllRead')}
                  </button>
                )}
              </div>

              <div className="max-h-[360px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-on-faint">
                    {t('topbar.noNotifications')}
                  </div>
                ) : (
                  notifications.slice(0, 8).map((notif) => (
                    <button
                      key={notif.id}
                      onClick={() => handleNotifClick(notif)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-secondary transition-colors ${
                        !notif.read ? "bg-brand-50/50" : ""
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {notifIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${
                            !notif.read ? "font-medium text-on" : "text-on-secondary"
                          }`}
                        >
                          {notif.title}
                        </p>
                        <p className="mt-0.5 text-xs text-on-muted truncate">
                          {notif.message}
                        </p>
                        <p className="mt-1 text-[11px] text-on-faint">
                          {timeAgo(notif.createdAt, tc)}
                        </p>
                      </div>
                      {!notif.read && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </button>
                  ))
                )}
              </div>

              <div className="border-t border-on-light px-4 py-2.5">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate("/dashboard/notifications");
                  }}
                  className="w-full text-center text-xs font-medium text-brand-600 hover:underline"
                >
                  {t('topbar.viewAll')}
                </button>
              </div>
            </div>
            </>
          )}
        </div>

        {/* Profile */}
        <div ref={profileRef} className="relative ml-1">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white hover:ring-2 hover:ring-brand-300 transition-all"
          >
            {initial}
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setProfileOpen(false)} />
              <div className="fixed left-4 right-4 top-14 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[220px] sm:z-50 rounded-lg border border-on bg-surface shadow-md">
              <div className="px-4 py-3 border-b border-on-light">
                <p className="text-sm font-medium text-on">
                  {user?.name || t('topbar.merchant')}
                </p>
                <p className="text-xs text-on-muted truncate">
                  {user?.email || "marchand@email.com"}
                </p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    navigate("/dashboard/profile");
                    setProfileOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-3 px-4 text-sm text-on-secondary hover:bg-surface-secondary"
                >
                  <User className="h-4 w-4" />
                  {t('topbar.myProfile')}
                </button>
                <button
                  onClick={() => {
                    navigate("/dashboard/settings");
                    setProfileOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-3 px-4 text-sm text-on-secondary hover:bg-surface-secondary"
                >
                  <SettingsIcon className="h-4 w-4" />
                  {t('topbar.settings')}
                </button>
                <button
                  onClick={() => {
                    navigate("/dashboard/billing");
                    setProfileOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-3 px-4 text-sm text-on-secondary hover:bg-surface-secondary"
                >
                  <CreditCard className="h-4 w-4" />
                  {t('topbar.billing')}
                </button>
              </div>
              <div className="border-t border-on-light py-1">
                <button
                  onClick={() => {
                    logout();
                    setProfileOpen(false);
                  }}
                  className="flex h-10 w-full items-center gap-3 px-4 text-sm text-red-600 hover:bg-surface-secondary"
                >
                  <LogOut className="h-4 w-4" />
                  {t('topbar.logout')}
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
