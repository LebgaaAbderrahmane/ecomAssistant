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
  RefreshCw,
  Globe,
  CheckCircle2,
  ExternalLink,
  Unplug,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button.js";
import { Badge } from "../../components/ui/Badge.js";
import { Card } from "../../components/ui/Card.js";
import { api } from "../../lib/api.js";
import { Input } from "../../components/ui/Input.js";
import { useNotifications } from "../../lib/notifications.js";
import { useTranslation } from 'react-i18next';

interface ShopInfo {
  name: string;
  email: string;
  phone: string;
  currency: string;
  timezone: string;
  plan_name: string;
  domain: string;
}

interface WebhookInfo {
  id: number;
  topic: string;
  address: string;
  created_at: string;
  updated_at: string;
}

interface StoreSettings {
  currency: string;
  defaultOrderStatus: string;
}

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
    <div className="inline-flex flex-wrap rounded-md border border-on">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-4 sm:px-5 py-2 text-sm font-medium transition-colors ${
            value === opt
              ? "border-2 border-brand-600 bg-surface text-brand-600 -m-[1px] z-10"
              : "bg-surface text-on-secondary hover:bg-surface-secondary"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function AgentConfigTab() {
  const { t } = useTranslation('settings');
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
      toast.success(t('agent.saved'));
    } catch {
      toast.error(t('agent.saveError'));
    }
    setSaving(false);
  };

  const languageOpts = [t('agent.autoDetect'), "Derja", t('agent.french'), "Arabe"];
  const toneOpts = [t('agent.friendly'), t('agent.formal')];
  const languageToValue: Record<string, string> = {
    [t('agent.autoDetect')]: "auto",
    Derja: "derdja",
    [t('agent.french')]: "french",
    Arabe: "arabic",
  };
  const toneToValue: Record<string, string> = {
    [t('agent.friendly')]: "friendly",
    [t('agent.formal')]: "formal",
  };
  const valueToLanguage: Record<string, string> = Object.fromEntries(
    Object.entries(languageToValue).map(([k, v]) => [v, k]),
  );
  const valueToTone: Record<string, string> = Object.fromEntries(
    Object.entries(toneToValue).map(([k, v]) => [v, k]),
  );

  if (loading)
    return <div className="text-sm text-on-muted py-4">{t('loading', { ns: 'common' })}</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-on">
        {t('tabs.agent')}
      </h2>

      <div>
        <label className="block text-sm font-medium text-on-secondary mb-2">
          {t('agent.language')}
        </label>
        <SegmentControl
          options={languageOpts}
          value={valueToLanguage[language] || languageOpts[0]}
          onChange={(v) => setLanguage(languageToValue[v])}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-on-secondary mb-2">
          {t('agent.tone')}
        </label>
        <SegmentControl
          options={toneOpts}
          value={valueToTone[tone] || toneOpts[0]}
          onChange={(v) => setTone(toneToValue[v])}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-on-secondary mb-2">
          {t('agent.followUpDelays')}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            value={delay1}
            onChange={(e) => setDelay1(e.target.value)}
            className="w-20 h-10 rounded-md border border-on bg-surface text-on px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <span className="text-sm text-on-muted">{t('agent.hours')}</span>
          <span className="text-on-faint text-lg">→</span>
          <input
            type="number"
            value={delay2}
            onChange={(e) => setDelay2(e.target.value)}
            className="w-20 h-10 rounded-md border border-on bg-surface text-on px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <span className="text-sm text-on-muted">{t('agent.hours')}</span>
          <span className="text-on-faint text-lg">→</span>
          <input
            type="number"
            value={delay3}
            onChange={(e) => setDelay3(e.target.value)}
            className="w-20 h-10 rounded-md border border-on bg-surface text-on px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <span className="text-sm text-on-muted">{t('agent.hours')}</span>
        </div>
        <p className="mt-1 text-[13px] text-on-muted">{t('agent.maxFollowUps')}</p>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          variant="primary"
          className="gap-2"
          onClick={handleSave}
          loading={saving}
        >
          <Save className="h-4 w-4" />
          {t('save', { ns: 'common' })}
        </Button>
      </div>
    </div>
  );
}

function StoreConnectionTab() {
  const { t } = useTranslation('settings');
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

  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [shopInfoLoading, setShopInfoLoading] = useState(true);
  const [webhooks, setWebhooks] = useState<WebhookInfo[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(true);
  const [reRegistering, setReRegistering] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    currency: "DZD",
    defaultOrderStatus: "PENDING",
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

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

  useEffect(() => {
    if (!store?.connected) return;
    setShopInfoLoading(true);
    api.get<ShopInfo>("/store-connection/shopify/shop-info")
      .then(setShopInfo)
      .catch(() => {})
      .finally(() => setShopInfoLoading(false));
  }, [store?.connected]);

  useEffect(() => {
    if (!store?.connected) return;
    setWebhooksLoading(true);
    api.get<WebhookInfo[]>("/store-connection/shopify/webhooks")
      .then(setWebhooks)
      .catch(() => {})
      .finally(() => setWebhooksLoading(false));
  }, [store?.connected]);

  useEffect(() => {
    if (!store?.connected) return;
    setSettingsLoading(true);
    api.get<StoreSettings>("/store-connection/shopify/store-settings")
      .then((s) => {
        if (s) setStoreSettings(s);
      })
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, [store?.connected]);

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
        t('store.popupBlocked'),
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
          t('store.windowClosed'),
        );
      }
    }, 500);

    timeoutRef.current = setTimeout(() => {
      clearInterval(checkClosed);
      cleanup();
      setError(
        t('store.timedOut'),
      );
    }, 120000);
  };

  const handleDisconnect = async () => {
    try {
      await api.post('/store-connection/shopify/disconnect', {});
      await api.post('/auth/logout', {});
      window.location.reload();
    } catch {
      toast.error(t('store.disconnectionError'));
    }
  };

  const handleReConnect = () => {
    const shop = store?.storeUrl || "";
    const shopName = shop.replace("https://", "").replace(".myshopify.com", "").replace(".com", "").split("/")[0];
    handleConnect(shopName);
  };

  const handleReRegisterWebhooks = async () => {
    setReRegistering(true);
    try {
      await api.post('/store-connection/shopify/re-register-webhooks', {});
      const updated = await api.get<WebhookInfo[]>("/store-connection/shopify/webhooks");
      setWebhooks(updated);
      toast.success(t('store.webhooksReRegistered'));
    } catch {
      toast.error(t('store.webhooksReRegisterError'));
    }
    setReRegistering(false);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.patch('/store-connection/shopify/store-settings', {
        currency: storeSettings.currency,
        defaultOrderStatus: storeSettings.defaultOrderStatus,
      });
      toast.success(t('store.saved'));
    } catch {
      toast.error(t('store.saveError'));
    }
    setSavingSettings(false);
  };

  if (loading)
    return <div className="text-sm text-on-muted py-4">{t('loading', { ns: 'common' })}</div>;

  if (!store?.connected) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-on">
          {t('tabs.store')}
        </h2>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-on-muted">{t('store.noStore')}</p>
            </div>
            <Badge variant="neutral">
              {t('store.disconnected')}
            </Badge>
          </div>
          <ConnectButton connecting={connecting} onConnect={handleConnect} />
        </Card>
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-900">{error}</p>
              <p className="text-xs text-amber-600 mt-1">
                {t('store.pendingValidation')}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  const expectedTopics = ["orders/create", "products/create", "products/update", "products/delete"];
  const registeredTopics = webhooks.map((w) => w.topic);
  const missingProductWebhooks = ["products/create", "products/update", "products/delete"].filter(
    (topic) => !registeredTopics.includes(topic)
  );

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-on">
        {t('tabs.store')}
      </h2>

      {/* Section 1: Connection Info */}
      <Card>
        <h3 className="text-sm font-semibold text-on mb-4">{t('store.connectionInfo')}</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="success">{t('store.connected')}</Badge>
            <div>
              <p className="text-sm font-medium text-on">{store.storeName}</p>
              <p className="text-[13px] text-on-muted flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" />
                {store.storeUrl}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {store.source && (
              <span className="text-[13px] text-on-muted flex items-center gap-1">
                <ExternalLink className="h-3.5 w-3.5" />
                {store.source}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Button variant="secondary" className="gap-2" onClick={handleReConnect}>
            <RefreshCw className="h-4 w-4" />
            {t('store.reconnect')}
          </Button>
          <Button variant="secondary" className="gap-2 text-red-600 hover:text-red-700" onClick={handleDisconnect}>
            <Unplug className="h-4 w-4" />
            {t('store.disconnect')}
          </Button>
        </div>
      </Card>

      {/* Section 2: Shop Info */}
      <Card>
        <h3 className="text-sm font-semibold text-on mb-4">{t('store.shopInfo')}</h3>
        {shopInfoLoading ? (
          <div className="flex items-center gap-2 text-sm text-on-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading', { ns: 'common' })}
          </div>
        ) : shopInfo ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[13px] text-on-muted">{t('store.shopName')}</p>
              <p className="text-sm font-medium text-on">{shopInfo.name}</p>
            </div>
            <div>
              <p className="text-[13px] text-on-muted">{t('store.email')}</p>
              <p className="text-sm font-medium text-on">{shopInfo.email}</p>
            </div>
            <div>
              <p className="text-[13px] text-on-muted">{t('store.phone')}</p>
              <p className="text-sm font-medium text-on">{shopInfo.phone || "—"}</p>
            </div>
            <div>
              <p className="text-[13px] text-on-muted">{t('store.currency')}</p>
              <p className="text-sm font-medium text-on">{shopInfo.currency}</p>
            </div>
            <div>
              <p className="text-[13px] text-on-muted">{t('store.timezone')}</p>
              <p className="text-sm font-medium text-on">{shopInfo.timezone}</p>
            </div>
            <div>
              <p className="text-[13px] text-on-muted">{t('store.plan')}</p>
              <p className="text-sm font-medium text-on">{shopInfo.plan_name || "—"}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-on-muted">{t('store.noShopInfo')}</p>
        )}
      </Card>

      {/* Section 3: Webhook Health */}
      <Card>
        <h3 className="text-sm font-semibold text-on mb-4">{t('store.webhookHealth')}</h3>
        {webhooksLoading ? (
          <div className="flex items-center gap-2 text-sm text-on-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading', { ns: 'common' })}
          </div>
        ) : (
          <div className="space-y-4">
            {missingProductWebhooks.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">
                  {t('store.webhookMissingWarning')}
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {expectedTopics.map((topic) => {
                const isRegistered = registeredTopics.includes(topic);
                return (
                  <div
                    key={topic}
                    className="flex items-center justify-between rounded-md border border-on px-3 py-2"
                  >
                    <span className="text-sm text-on font-mono">{topic}</span>
                    <Badge variant={isRegistered ? "success" : "danger"}>
                      <span className="flex items-center gap-1">
                        {isRegistered ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Info className="h-3.5 w-3.5" />
                        )}
                        {isRegistered ? t('store.webhooksRegistered') : t('store.webhooksMissing')}
                      </span>
                    </Badge>
                  </div>
                );
              })}
            </div>
            <Button
              variant="secondary"
              className="gap-2"
              onClick={handleReRegisterWebhooks}
              loading={reRegistering}
            >
              <RefreshCw className="h-4 w-4" />
              {t('store.reRegisterWebhooks')}
            </Button>
          </div>
        )}
      </Card>

      {/* Section 4: Store Preferences */}
      <Card>
        <h3 className="text-sm font-semibold text-on mb-4">{t('store.preferences')}</h3>
        {settingsLoading ? (
          <div className="flex items-center gap-2 text-sm text-on-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading', { ns: 'common' })}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-on-secondary mb-1.5">
                {t('store.currency')}
              </label>
              <select
                value={storeSettings.currency}
                onChange={(e) =>
                  setStoreSettings((prev) => ({ ...prev, currency: e.target.value }))
                }
                className="h-10 w-full rounded-md border border-on bg-surface text-on px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="DZD">DZD - Dinar Algérien</option>
                <option value="EUR">EUR - Euro</option>
                <option value="USD">USD - Dollar Américain</option>
                <option value="GBP">GBP - Livre Sterling</option>
                <option value="MAD">MAD - Dirham Marocain</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-secondary mb-1.5">
                {t('store.defaultOrderStatus')}
              </label>
              <select
                value={storeSettings.defaultOrderStatus}
                onChange={(e) =>
                  setStoreSettings((prev) => ({
                    ...prev,
                    defaultOrderStatus: e.target.value,
                  }))
                }
                className="h-10 w-full rounded-md border border-on bg-surface text-on px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="PENDING">PENDING</option>
                <option value="CONFIRMED">CONFIRMED</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="primary"
                className="gap-2"
                onClick={handleSaveSettings}
                loading={savingSettings}
              >
                <Save className="h-4 w-4" />
                {t('store.save')}
              </Button>
            </div>
          </div>
        )}
      </Card>
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
  const { t } = useTranslation('settings');
  const [shop, setShop] = useState("");
  const [showInput, setShowInput] = useState(false);

  if (!showInput) {
    return (
      <Button
        variant="secondary"
        className="mt-4"
        onClick={() => setShowInput(true)}
      >
        {t('store.connectStore')}
      </Button>
    );
  }

  return (
    <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
      <div className="flex-1">
        <Input
          label={t('store.shopifyName')}
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
        {t('store.connect', { ns: 'common' })}
      </Button>
    </div>
  );
}

function WhatsAppTab() {
  const { t } = useTranslation('settings');
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
        toast.success(t('whatsapp.connected'));
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
            toast.success(t('whatsapp.connected'));
          }
        } catch {
          /* keep polling */
        }
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
      toast.error(t('whatsapp.connectionError'));
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    setShowDisconnectConfirm(false);
    suppressDisconnectModal();
    try {
      await api.delete("/whatsapp/session");
      toast.success(t('whatsapp.disconnected'));
    } catch {
      toast.error(t('whatsapp.disconnectionError'));
    }
    setDisconnecting(false);
  };

  if (loading)
    return <div className="text-sm text-on-muted py-4">{t('loading', { ns: 'common' })}</div>;

  if (qrBase64) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-on">
          {t('whatsapp.connectWhatsApp')}
        </h2>
        <div className="flex flex-col items-center gap-4 rounded-md border border-on p-6">
          <p className="text-sm font-medium text-on-secondary">
            {t('whatsapp.scanQR')}
          </p>
          <img
            src={`data:image/png;base64,${qrBase64}`}
            alt="QR"
            className="h-64 w-64"
          />
          <div className="flex items-center gap-2 text-sm text-on-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('whatsapp.waitingScan')}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQrBase64(null);
              setConnecting(false);
            }}
          >
            {t('cancel', { ns: 'common' })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-on">{t('tabs.whatsapp')}</h2>
      <div className="rounded-md border border-on p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-on">
              {whatsappPhoneNumber || t('whatsapp.noNumber')}
            </p>
            {whatsappPhoneNumber && (
              <p className="text-[13px] text-on-muted">{t('whatsapp.businessApp')}</p>
            )}
          </div>
          <Badge variant={whatsappConnected ? "success" : "danger"}>
            {whatsappConnected ? t('whatsapp.connected') : t('whatsapp.disconnected')}
          </Badge>
        </div>
        {whatsappConnected ? (
          <Button variant="secondary" className="mt-4" onClick={() => setShowDisconnectConfirm(true)} loading={disconnecting}>
            {t('whatsapp.disconnectBtn')}
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="mt-4"
            onClick={connect}
            loading={connecting}
          >
            {t('whatsapp.connectWhatsApp')}
          </Button>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div>
        <h3 className="text-sm font-medium text-on-secondary mb-3">
          {t('whatsapp.messageTemplates')}
        </h3>
        <div className="space-y-2">
          {[
            { name: t('whatsapp.orderConfirmation'), status: "approved" as const },
            { name: t('whatsapp.deliveryUpdate'), status: "pending" as const },
            { name: t('whatsapp.cartFollowUp'), status: "approved" as const },
          ].map((tmpl) => (
            <div
              key={tmpl.name}
              className="flex items-center justify-between rounded-md border border-on px-4 py-3"
            >
              <span className="text-sm text-on">{tmpl.name}</span>
              <Badge
                variant={tmpl.status === "approved" ? "success" : "warning"}
              >
                {tmpl.status === "approved" ? t('whatsapp.approved') : "En attente"}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>

    {showDisconnectConfirm && (
      <div className="fixed inset-0 z-[90] flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={() => setShowDisconnectConfirm(false)} />
        <div className="relative z-10 w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-on">
                {t('whatsapp.disconnectTitle')}
              </h2>
              <p className="mt-2 text-sm text-on-muted">
                {t('whatsapp.disconnectDesc')}
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setShowDisconnectConfirm(false)}>
              {t('cancel', { ns: 'common' })}
            </Button>
            <Button size="sm" variant="danger" onClick={disconnect} loading={disconnecting}>
              {t('whatsapp.disconnectBtn')}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function WilayaPricingTab() {
  const { t } = useTranslation('settings');
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-on">{t('tabs.wilaya')}</h2>
      <p className="text-sm text-on-muted">
        {t('wilaya.title')}
      </p>
    </div>
  );
}

export function Settings() {
  const { t } = useTranslation('settings');
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab") as SettingsTab | null;

  const translatedTabs: { id: SettingsTab; label: string; icon: typeof Store }[] = [
    { id: "agent", label: t('tabs.agent'), icon: Smartphone },
    { id: "store", label: t('tabs.store'), icon: Store },
    { id: "whatsapp", label: t('tabs.whatsapp'), icon: Phone },
    { id: "wilaya", label: t('tabs.wilaya'), icon: MapPin },
  ];

  const activeTab = urlTab && translatedTabs.some((tab) => tab.id === urlTab) ? urlTab : "agent";

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
      <h1 className="text-2xl font-bold text-on">{t('title')}</h1>
      <p className="mt-1 text-sm text-on-muted">
        {t('subtitle')}
      </p>

      <div className="mt-6 lg:flex lg:gap-6">
        <div className="lg:w-[220px] lg:shrink-0 mb-4 lg:mb-0">
          <div className="lg:rounded-lg lg:border lg:border-on lg:bg-surface lg:p-2 flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1 lg:gap-1 -mx-4 px-4 lg:mx-0 lg:px-0">
            {translatedTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-md px-4 py-[10px] text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === tab.id
                    ? "bg-brand-600 text-white"
                    : "text-on-muted hover:bg-surface-secondary hover:text-on-secondary lg:hover:bg-surface-secondary"
                }`}
              >
                <tab.icon className="h-[18px] w-[18px]" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 rounded-lg border border-on bg-surface p-4 sm:p-5">
          {content[activeTab]}
        </div>
      </div>
    </div>
  );
}
