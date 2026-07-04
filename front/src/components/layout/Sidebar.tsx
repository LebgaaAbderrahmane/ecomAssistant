import { NavLink } from 'react-router-dom'
import { Home, MessageSquare, AlertTriangle, Package, ShoppingCart, Settings, CreditCard, ExternalLink } from 'lucide-react'

const navItems = [
  { to: '/dashboard', label: 'Accueil', icon: Home },
  { to: '/dashboard/conversations', label: 'Conversations', icon: MessageSquare },
  { to: '/dashboard/escalations', label: 'Escalades', icon: AlertTriangle, badge: 3 },
  { to: '/dashboard/orders', label: 'Commandes', icon: ShoppingCart },
  { to: '/dashboard/catalog', label: 'Catalogue', icon: Package },
  { to: '/dashboard/settings', label: 'Paramètres', icon: Settings },
  { to: '/dashboard/billing', label: 'Facturation', icon: CreditCard },
]

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 flex h-screen w-[250px] flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-3 px-6 pt-5 pb-6">
        <img src="/ecomAssistantLogo.svg" alt="EcomAssistant" className="h-8 w-8" />
        <span className="text-lg font-semibold text-gray-900">EcomAssistant</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-[10px] text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`
            }
          >
            <item.icon className="h-[18px] w-[18px]" />
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-5">
        <div className="rounded-lg bg-brand-50 p-3">
          <p className="text-[13px] font-semibold text-brand-600">Plan Growth</p>
          <p className="text-xs text-gray-500">Expire le 11 juil. 2026</p>
          <button className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            Gérer l'abonnement
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>
    </aside>
  )
}
