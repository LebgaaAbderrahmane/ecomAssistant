import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { Button } from "./Button.js";
import { useNotifications } from "../../lib/notifications.js";

export function DisconnectModal() {
  const { t } = useTranslation('common');
  const { showDisconnectModal, dismissDisconnectModal } = useNotifications();
  const navigate = useNavigate();

  if (!showDisconnectModal) return null;

  const handleReconnect = () => {
    dismissDisconnectModal();
    navigate("/dashboard/settings?tab=whatsapp");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleReconnect} />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-surface p-6 shadow-xl border border-on">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-on">
              {t('disconnectModal.title')}
            </h2>
            <p className="mt-2 text-sm text-on-muted">
              {t('disconnectModal.description')}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={dismissDisconnectModal}>
            {t('ignore')}
          </Button>
          <Button size="sm" onClick={handleReconnect}>
            {t('reconnect')}
          </Button>
        </div>
      </div>
    </div>
  );
}
