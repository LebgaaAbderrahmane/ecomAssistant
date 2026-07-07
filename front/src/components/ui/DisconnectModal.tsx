import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button.js";
import { useNotifications } from "../../lib/notifications.js";

export function DisconnectModal() {
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
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              WhatsApp Déconnecté
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Votre session WhatsApp est déconnectée. Veuillez la reconnecter
              pour continuer à recevoir et envoyer des messages.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={dismissDisconnectModal}>
            Ignorer
          </Button>
          <Button size="sm" onClick={handleReconnect}>
            Reconnecter
          </Button>
        </div>
      </div>
    </div>
  );
}
