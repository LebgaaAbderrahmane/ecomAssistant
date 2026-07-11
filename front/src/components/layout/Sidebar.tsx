import { NavLink } from 'react-router-dom'
import { Home, AlertTriangle, Package, ShoppingCart, Settings, CreditCard, Bell, ExternalLink, User, Users, X } from 'lucide-react'
import { useNotifications } from '../../lib/notifications.js'
import { useMobileMenu } from '../../lib/mobileMenu.js'

export function Sidebar() {
  const { unreadCount } = useNotifications()
  const { isOpen, close } = useMobileMenu()

  const mainItems = [
    { to: '/dashboard', label: 'Accueil', icon: Home },
    { to: '/dashboard/orders', label: 'Commandes', icon: ShoppingCart },
    { to: '/dashboard/customers', label: 'Clients', icon: Users },
    { to: '/dashboard/catalog', label: 'Catalogue', icon: Package },
    { to: '/dashboard/escalations', label: 'Escalades', icon: AlertTriangle },
  ]

  const utilityItems = [
    { to: '/dashboard/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { to: '/dashboard/profile', label: 'Profil', icon: User },
    { to: '/dashboard/settings', label: 'Paramètres', icon: Settings },
    { to: '/dashboard/billing', label: 'Facturation', icon: CreditCard },
  ]

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
        <p className="px-3 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-on-faint">Menu</p>
        {mainItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            onClick={close}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-[10px] text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
                  : 'text-on-muted hover:bg-surface-secondary hover:text-on-secondary'
              }`
            }
          >
            <item.icon className="h-[18px] w-[18px]" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div className="my-3 border-t border-on-light" />
        <p className="px-3 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-on-faint">Utilitaires</p>

        {utilityItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={close}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-[10px] text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
                  : 'text-on-muted hover:bg-surface-secondary hover:text-on-secondary'
              }`
            }
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
      </nav>

      <div className="px-3 pb-5">
        <div className="rounded-lg bg-brand-50 dark:bg-brand-900/20 p-3">
          <p className="text-[13px] font-semibold text-brand-600">Plan Growth</p>
          <p className="text-xs text-on-muted">Expire le 11 juil. 2026</p>
          <button className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            Gérer l'abonnement
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
