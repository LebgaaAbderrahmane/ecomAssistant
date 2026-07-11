import { useAuth } from "../../lib/auth.js";
import { Badge } from "../../components/ui/Badge.js";
import { useTranslation } from 'react-i18next';

export function Profile() {
  const { user } = useAuth();
  const { t } = useTranslation('profile');

  return (
    <div>
      <h1 className="text-2xl font-bold text-on">{t('title')}</h1>
      <p className="mt-1 text-sm text-on-muted">
        {t('subtitle')}
      </p>

      <div className="mt-6 max-w-lg space-y-6">
        <div className="rounded-lg border border-on bg-surface p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white">
              {user?.name?.charAt(0).toUpperCase() || "M"}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-on">
                {user?.name || t('merchant')}
              </h2>
              <p className="text-sm text-on-muted">{user?.email}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-on bg-surface p-6 space-y-4">
          <h3 className="text-sm font-semibold text-on">
            {t('accountInfo')}
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-muted">{t('name')}</span>
              <span className="text-sm font-medium text-on">
                {user?.name || "—"}
              </span>
            </div>
            <div className="border-t border-on-light" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-muted">{t('email')}</span>
              <span className="text-sm font-medium text-on">
                {user?.email || "—"}
              </span>
            </div>
            <div className="border-t border-on-light" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-muted">{t('store')}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-on">
                  {user?.shopName || "—"}
                </span>
                {user?.shopName && <Badge variant="success">{t('connected')}</Badge>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
