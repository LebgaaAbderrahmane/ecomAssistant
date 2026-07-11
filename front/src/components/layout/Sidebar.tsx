import { useState } from 'react'
import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { Home, AlertTriangle, Package, ShoppingCart, Settings, CreditCard, Bell, ExternalLink, User, Users, X, ChevronDown, Smartphone, Phone, MapPin, Store } from 'lucide-react'
import { useNotifications } from '../../lib/notifications.js'
import { useMobileMenu } from '../../lib/mobileMenu.js'
import { useTranslation } from 'react-i18next'

export function Sidebar() {
  const { unreadCount } = useNotifications()
  const { isOpen, close } = useMobileMenu()
  const { t } = useTranslation('layout')
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const isSettingsPage = location.pathname === '/dashboard/settings'
  const currentTab = searchParams.get('tab') || 'agent'
  const [settingsOpen, setSettingsOpen] = useState(isSettingsPage)

  const mainItems = [
    { to: '/dashboard', label: t('sidebar.home'), icon: Home },
    { to: '/dashboard/orders', label: t('sidebar.orders'), icon: ShoppingCart },
    { to: '/dashboard/customers', label: t('sidebar.customers'), icon: Users },
    { to: '/dashboard/catalog', label: t('sidebar.catalog'), icon: Package },
    { to: '/dashboard/escalations', label: t('sidebar.escalations'), icon: AlertTriangle },
  ]

  const utilityItems = [
    { to: '/dashboard/notifications', label: t('sidebar.notifications'), icon: Bell, badge: unreadCount },
    { to: '/dashboard/profile', label: t('sidebar.profile'), icon: User },
    { to: '/dashboard/billing', label: t('sidebar.billing'), icon: CreditCard },
  ]

  const settingsSubItems = [
    { tab: 'agent', label: t('sidebar.settingsAgent'), icon: Smartphone },
    { tab: 'store', label: t('sidebar.settingsStore'), icon: Store },
    { tab: 'whatsapp', label: t('sidebar.settingsWhatsapp'), icon: Phone },
    { tab: 'wilaya', label: t('sidebar.settingsWilaya'), icon: MapPin },
  ]

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-[10px] text-sm font-medium transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
        : 'text-on-muted hover:bg-surface-secondary hover:text-on-secondary'
    }`

  const subLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-[7px] text-[13px] font-medium transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
        : 'text-on-muted hover:bg-surface-secondary hover:text-on-secondary'
    }`

  const handleSettingsClick = () => {
    setSettingsOpen(prev => !prev)
  }

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-6 pt-5 pb-6">
        <div className="flex items-center gap-3">
          <img src="/ecomAssistantLogo.svg" alt="EcomAssistant" className="h-8 w-8" />
          <span className="text-lg font-semibold text-on">EcomAssistant</span>
        </div>
        <button onClick={close} className="lg:hidden rounded-md p-1 text-on-faint hover:text-on-muted">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
        <p className="px-3 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-on-faint">{t('sidebar.menu')}</p>
        {mainItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            onClick={close}
            className={navLinkClass}
          >
            <item.icon className="h-[18px] w-[18px]" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div className="my-3 border-t border-on-light" />
        <p className="px-3 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-on-faint">{t('sidebar.utilities')}</p>

        {utilityItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={close}
            className={navLinkClass}
          >
            <item.icon className="h-[18px] w-[18px]" />
            <span>{item.label}</span>
            {'badge' in item && item.badge !== undefined && item.badge > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </NavLink>
        ))}

        {/* Settings with expandable sub-items */}
        <div className="mt-0.5">
          <NavLink
            to="/dashboard/settings?tab=agent"
            onClick={(e) => {
              handleSettingsClick()
              close()
            }}
            className={navLinkClass({ isActive: isSettingsPage })}
          >
            <Settings className="h-[18px] w-[18px]" />
            <span>{t('sidebar.settings')}</span>
            <ChevronDown
              className={`ml-auto h-4 w-4 transition-transform duration-200 ${
                settingsOpen ? '' : '-rotate-90'
              }`}
            />
          </NavLink>

          {settingsOpen && (
            <div className="ml-5 mt-0.5 space-y-0.5 border-l border-on-light pl-3">
              {settingsSubItems.map((sub) => (
                <NavLink
                  key={sub.tab}
                  to={`/dashboard/settings?tab=${sub.tab}`}
                  onClick={close}
                  className={subLinkClass({ isActive: isSettingsPage && currentTab === sub.tab })}
                >
                  <sub.icon className="h-4 w-4" />
                  <span>{sub.label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className="px-3 pb-5">
        <div className="rounded-lg bg-brand-50 dark:bg-brand-900/20 p-3">
          <p className="text-[13px] font-semibold text-brand-600">{t('sidebar.planGrowth')}</p>
          <p className="text-xs text-on-muted">{t('sidebar.expiresAt')}</p>
          <button className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            {t('sidebar.manageSubscription')}
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[250px] flex-col border-r border-on bg-surface z-40">
        {sidebarContent}
      </aside>

      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <aside className="absolute left-0 top-0 flex h-screen w-[280px] flex-col border-r border-on bg-surface animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
