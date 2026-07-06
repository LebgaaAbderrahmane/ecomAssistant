import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Save,
  Smartphone,
  Store,
  Phone,
  MapPin,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../../components/ui/Button.js";
import { Badge } from "../../components/ui/Badge.js";
import { api } from "../../lib/api.js";
import { Input } from "../../components/ui/Input.js";
import { useNotifications } from "../../lib/notifications.js";

type SettingsTab = "agent" | "store" | "whatsapp" | "wilaya";

const tabs: { id: SettingsTab; label: string; icon: typeof Store }[] = [
  { id: "agent", label: "Configuration agent", icon: Smartphone },
  { id: "store", label: "Connexion boutique", icon: Store },
  { id: "whatsapp", label: "WhatsApp", icon: Phone },
  { id: "wilaya", label: "Wilaya pricing", icon: MapPin },
];

function SegmentControl({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-200">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-5 py-2 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
            value === opt
              ? "border-2 border-brand-600 bg-white text-brand-600 -m-[1px] z-10"
              : "bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function AgentConfigTab() {
  const [language, setLanguage] = useState("auto");
  const [tone, setTone] = useState("friendly");
  const [delay1, setDelay1] = useState("2");
  const [delay2, setDelay2] = useState("24");
  const [delay3, setDelay3] = useState("48");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{
        defaultLanguage?: string;
        tone?: string;
        followUpDelays?: number[];
      }>("/agent-config")
      .then((cfg) => {
        if (cfg.defaultLanguage) setLanguage(cfg.defaultLanguage);
        if (cfg.tone) setTone(cfg.tone);
        if (cfg.followUpDelays?.length === 3) {
          setDelay1(String(cfg.followUpDelays[0]));
          setDelay2(String(cfg.followUpDelays[1]));
          setDelay3(String(cfg.followUpDelays[2]));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/agent-config", {
        defaultLanguage: language,
        tone,
        followUpDelays: [
          parseInt(delay1, 10),
          parseInt(delay2, 10),
          parseInt(delay3, 10),
        ],
      });
    } catch {}
    setSaving(false);
  };

  const languageOpts = ["Auto-détection", "Derja", "Français", "Arabe"];
  const toneOpts = ["Amical", "Formel"];
  const languageToValue: Record<string, string> = {
    "Auto-détection": "auto",
    Derja: "derdja",
    Français: "french",
    Arabe: "arabic",
  };
  const toneToValue: Record<string, string> = {
    Amical: "friendly",
    Formel: "formal",
  };
  const valueToLanguage: Record<string, string> = Object.fromEntries(
    Object.entries(languageToValue).map(([k, v]) => [v, k]),
  );
  const valueToTone: Record<string, string> = Object.fromEntries(
    Object.entries(toneToValue).map(([k, v]) => [v, k]),
  );

  if (loading)
    return <div className="text-sm text-gray-500 py-4">Chargement...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">
        Configuration agent
      </h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Mode linguistique
        </label>
        <SegmentControl
          options={languageOpts}
          value={valueToLanguage[language] || languageOpts[0]}
          onChange={(v) => setLanguage(languageToValue[v])}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Ton
        </label>
        <SegmentControl
          options={toneOpts}
          value={valueToTone[tone] || toneOpts[0]}
          onChange={(v) => setTone(toneToValue[v])}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Délais de relance
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={delay1}
            onChange={(e) => setDelay1(e.target.value)}
            className="w-20 h-10 rounded-md border border-gray-300 px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <span className="text-sm text-gray-500">heures</span>
          <span className="text-gray-300 text-lg">→</span>
          <input
            type="number"
            value={delay2}
            onChange={(e) => setDelay2(e.target.value)}
            className="w-20 h-10 rounded-md border border-gray-300 px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <span className="text-sm text-gray-500">heures</span>
          <span className="text-gray-300 text-lg">→</span>
          <input
            type="number"
            value={delay3}
            onChange={(e) => setDelay3(e.target.value)}
            className="w-20 h-10 rounded-md border border-gray-300 px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <span className="text-sm text-gray-500">heures</span>
        </div>
        <p className="mt-1 text-[13px] text-gray-500">Relances max : 3</p>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          variant="primary"
          className="gap-2"
          onClick={handleSave}
          loading={saving}
        >
          <Save className="h-4 w-4" />
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

function StoreConnectionTab() {
  const [store, setStore] = useState<{
    connected: boolean;
    source?: string;
    storeName?: string;
    storeUrl?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setConnecting(false);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const fetchStatus = async () => {
    try {
      const data = await api.get<{
        connected: boolean;
        source?: string;
        storeName?: string;
        storeUrl?: string;
      }>("/store-connection/status");
      setStore(data);
    } catch {
      setStore({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnect = async (shop: string) => {
    setError("");
    setConnecting(true);

    const fullDomain = shop.includes(".myshopify.com")
      ? shop
      : `${shop}.myshopify.com`;
    const popup = window.open(
      `/store-connection/shopify/authenticate?shop=${fullDomain}`,
      "shopify-oauth",
      "width=600,height=700",
    );

    if (!popup) {
      setConnecting(false);
      setError(
        "Le popup a été bloqué par votre navigateur. Autorisez les popups pour ce site et réessayez.",
      );
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const status = await api.get<{
          connected: boolean;
          source?: string;
          storeName?: string;
          storeUrl?: string;
        }>("/store-connection/status");
        if (status.connected) {
          cleanup();
          setStore(status);
        }
      } catch {}
    }, 2000);

    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        cleanup();
        setError(
          "Fenêtre Shopify fermée. Si l'application est en cours de validation par Shopify, " +
          "l'installation ne peut pas continuer.",
        );
      }
    }, 500);

    timeoutRef.current = setTimeout(() => {
      clearInterval(checkClosed);
      cleanup();
      setError(
        "La connexion a pris trop de temps. Vérifiez que l'application Shopify est autorisée.",
      );
    }, 120000);
  };

  if (loading)
    return <div className="text-sm text-gray-500 py-4">Chargement...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">
        Connexion boutique
      </h2>
      <div className="rounded-md border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            {store?.connected ? (
              <>
                <p className="text-sm font-medium text-gray-900">
                  {store.source} — {store.storeName}
                </p>
                <p className="text-[13px] text-gray-500">{store.storeUrl}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">Aucune boutique connectée</p>
            )}
          </div>
          <Badge variant={store?.connected ? "success" : "neutral"}>
            {store?.connected ? "Connecté" : "Déconnecté"}
          </Badge>
        </div>
        {!store?.connected && (
          <ConnectButton connecting={connecting} onConnect={handleConnect} />
        )}
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-900">{error}</p>
            <p className="text-xs text-amber-600 mt-1">
              L'application Shopify est en cours de validation. Vous pouvez
              réessayer plus tard.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectButton({
  connecting,
  onConnect,
}: {
  connecting: boolean;
  onConnect: (shop: string) => void;
}) {
  const [shop, setShop] = useState("");
  const [showInput, setShowInput] = useState(false);

  if (!showInput) {
    return (
      <Button
        variant="secondary"
        className="mt-4"
        onClick={() => setShowInput(true)}
      >
        Connecter une boutique
      </Button>
    );
  }

  return (
    <div className="mt-4 flex items-end gap-2">
      <div className="flex-1">
        <Input
          label="Nom de la boutique Shopify"
          type="text"
          placeholder="ma-boutique"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
        />
      </div>
      <Button
        onClick={() => onConnect(shop)}
        loading={connecting}
        disabled={!shop || connecting}
      >
        Connecter
      </Button>
    </div>
  );
}

function WhatsAppTab() {
  const { whatsappConnected, whatsappPhoneNumber, suppressDisconnectModal } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [error, setError] = useState("");

  const connect = async () => {
    setConnecting(true);
    setError("");
    try {
      const res = await api.post<{ qrBase64?: string; connected?: boolean }>(
        "/whatsapp/session",
        {},
      );
      if (res.connected) {
        setConnecting(false);
        return;
      }
      setQrBase64(res.qrBase64 ?? null);

      const poll = setInterval(async () => {
        try {
          const data = await api.get<{
            status: string;
            phoneNumber: string | null;
          }>("/whatsapp/session/status");
          if (data.status === "connected") {
            clearInterval(poll);
            setQrBase64(null);
            setConnecting(false);
          }
        } catch {
          /* keep polling */
        }
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    setShowDisconnectConfirm(false);
    suppressDisconnectModal();
    try {
      await api.delete("/whatsapp/session");
    } catch {
      /* ignore */
    }
    setDisconnecting(false);
  };

  if (loading)
    return <div className="text-sm text-gray-500 py-4">Chargement...</div>;

  if (qrBase64) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Connecter WhatsApp
        </h2>
        <div className="flex flex-col items-center gap-4 rounded-md border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-700">
            Scannez ce code QR avec WhatsApp
          </p>
          <img
            src={`data:image/png;base64,${qrBase64}`}
            alt="QR"
            className="h-64 w-64"
          />
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            En attente de scan...
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQrBase64(null);
              setConnecting(false);
            }}
          >
            Annuler
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">WhatsApp</h2>
      <div className="rounded-md border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {whatsappPhoneNumber || "Aucun numéro connecté"}
            </p>
            {whatsappPhoneNumber && (
              <p className="text-[13px] text-gray-500">WhatsApp Business</p>
            )}
          </div>
          <Badge variant={whatsappConnected ? "success" : "danger"}>
            {whatsappConnected ? "Connecté" : "Déconnecté"}
          </Badge>
        </div>
        {whatsappConnected ? (
          <Button variant="secondary" className="mt-4" onClick={() => setShowDisconnectConfirm(true)} loading={disconnecting}>
            Déconnecter
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="mt-4"
            onClick={connect}
            loading={connecting}
          >
            Connecter WhatsApp
          </Button>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Modèles de message
        </h3>
        <div className="space-y-2">
          {[
            { name: "Confirmation de commande", status: "approved" as const },
            { name: "Mise à jour de livraison", status: "pending" as const },
            { name: "Relance panier abandonné", status: "approved" as const },
          ].map((tmpl) => (
            <div
              key={tmpl.name}
              className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3"
            >
              <span className="text-sm text-gray-900">{tmpl.name}</span>
              <Badge
                variant={tmpl.status === "approved" ? "success" : "warning"}
              >
                {tmpl.status === "approved" ? "Approuvé" : "En attente"}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>

    {showDisconnectConfirm && (
      <div className="fixed inset-0 z-[90] flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={() => setShowDisconnectConfirm(false)} />
        <div className="relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">
                Déconnecter WhatsApp ?
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Vous ne pourrez plus envoyer ni recevoir de messages tant que la session n'est pas reconnectée.
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setShowDisconnectConfirm(false)}>
              Annuler
            </Button>
            <Button size="sm" variant="danger" onClick={disconnect} loading={disconnecting}>
              Déconnecter
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function WilayaPricingTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Wilaya pricing</h2>
      <p className="text-sm text-gray-500">
        Tableau des frais de livraison par wilaya (à implémenter)
      </p>
    </div>
  );
}

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab") as SettingsTab | null;
  const activeTab = urlTab && tabs.some((t) => t.id === urlTab) ? urlTab : "agent";

  const setActiveTab = (tab: SettingsTab) => {
    setSearchParams({ tab });
  };

  const content: Record<SettingsTab, React.ReactNode> = {
    agent: <AgentConfigTab />,
    store: <StoreConnectionTab />,
    whatsapp: <WhatsAppTab />,
    wilaya: <WilayaPricingTab />,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
      <p className="mt-1 text-sm text-gray-500">
        Gérez votre boutique, votre agent et vos paramètres de livraison
      </p>

      <div className="mt-6 flex gap-6">
        <div className="w-[220px] shrink-0">
          <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center gap-3 rounded-md px-4 py-[10px] text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-brand-600 text-white"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
              >
                <tab.icon className="h-[18px] w-[18px]" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 rounded-lg border border-gray-200 bg-white p-[20px_24px]">
          {content[activeTab]}
        </div>
      </div>
    </div>
  );
}
