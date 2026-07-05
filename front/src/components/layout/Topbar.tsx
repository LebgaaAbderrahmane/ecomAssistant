import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store,
  ChevronDown,
  Settings as SettingsIcon,
  CreditCard,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../lib/auth.js";

export function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initial = user?.name?.charAt(0).toUpperCase() || "M";

  return (
    <header className="sticky top-0 z-50 flex h-14  ml-[250px] items-center justify-between border-b border-gray-200 bg-white px-8">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
        <Store className="h-[18px] w-[18px]" />
        <span>{user?.shopName || user?.name || 'Mon Espace'}</span>
      </div>

      <div ref={ref} className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-50 transition-colors"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
            {initial}
          </div>
          <span className="text-sm text-gray-700">
            {user?.email || "marchand@email.com"}
          </span>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white shadow-md">
            <button
              onClick={() => {
                navigate("/dashboard/settings");
                setDropdownOpen(false);
              }}
              className="flex h-10 w-full items-center gap-3 px-4 text-sm text-gray-700 hover:bg-gray-50"
            >
              <SettingsIcon className="h-4 w-4" />
              Paramètres
            </button>
            <button
              onClick={() => {
                navigate("/dashboard/billing");
                setDropdownOpen(false);
              }}
              className="flex h-10 w-full items-center gap-3 px-4 text-sm text-gray-700 hover:bg-gray-50"
            >
              <CreditCard className="h-4 w-4" />
              Facturation
            </button>
            <div className="border-t border-gray-200" />
            <button
              onClick={() => {
                logout();
                setDropdownOpen(false);
              }}
              className="flex h-10 w-full items-center gap-3 px-4 text-sm text-red-600 hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
