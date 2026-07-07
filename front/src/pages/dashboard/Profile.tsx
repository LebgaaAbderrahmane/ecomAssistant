import { useAuth } from "../../lib/auth.js";
import { Badge } from "../../components/ui/Badge.js";

export function Profile() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Mon profil</h1>
      <p className="mt-1 text-sm text-gray-500">
        Gérez vos informations personnelles
      </p>

      <div className="mt-6 max-w-lg space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white">
              {user?.name?.charAt(0).toUpperCase() || "M"}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {user?.name || "Marchand"}
              </h2>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Informations du compte
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Nom</span>
              <span className="text-sm font-medium text-gray-900">
                {user?.name || "—"}
              </span>
            </div>
            <div className="border-t border-gray-100" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Email</span>
              <span className="text-sm font-medium text-gray-900">
                {user?.email || "—"}
              </span>
            </div>
            <div className="border-t border-gray-100" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Boutique</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {user?.shopName || "—"}
                </span>
                {user?.shopName && <Badge variant="success">Connecté</Badge>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
