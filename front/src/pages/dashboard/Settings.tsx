import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Truck,
  X,
  Save,
  Phone,
  RefreshCw,
  Globe,
  ExternalLink,
  Unplug,
  Info,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button.js";
import { Badge } from "../../components/ui/Badge.js";
import { Card } from "../../components/ui/Card.js";
import { api } from "../../lib/api.js";
import { Input } from "../../components/ui/Input.js";
import { useNotifications } from "../../lib/notifications.js";
import { useTranslation } from 'react-i18next';
import { DELIVERY_PROVIDERS, getProviderMeta, DeliveryProviderKey } from '@ecomassistant/shared';

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

type SettingsTab = "agent" | "store" | "whatsapp" | "wilaya" | "delivery";

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

const DEFAULT_TEMPLATES: Record<string, string> = {
  orderConfirmation: [
    "Bonjour {clientName},",
    "",
    "Votre commande #{orderId} pour \"{productName}\" a bien été reçue.",
    "",
    "Montant: {totalAmount} DA",
    "Wilaya: {wilaya}",
    "",
    "Merci pour votre confiance !",
  ].join("\n"),
  cartFollowUp: [
    "Bonjour {clientName},",
    "",
    "J'ai remarqué que vous étiez intéressé par \"{productName}\". Avez-vous des questions ?",
  ].join("\n"),
  greeting: [
    "Bienvenue chez {shopName} ! 👋",
    "",
    "Comment puis-je vous aider ?",
  ].join("\n"),
};

function AgentConfigTab() {
  const { t } = useTranslation('settings');
  const [isActive, setIsActive] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [tone, setTone] = useState("friendly");
  const [delay1, setDelay1] = useState("2");
  const [delay2, setDelay2] = useState("24");
  const [delay3, setDelay3] = useState("48");
  const [maxFollowUps, setMaxFollowUps] = useState("3");
  const [templates, setTemplates] = useState<Record<string, string>>(DEFAULT_TEMPLATES);
  const [activeTemplate, setActiveTemplate] = useState<string>("orderConfirmation");
  const [escalationThreshold, setEscalationThreshold] = useState("3");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{
        isActive?: boolean;
        defaultLanguage?: string;
        tone?: string;
        followUpDelays?: number[];
        maxFollowUps?: number;
        templates?: Record<string, string>;
        escalationThreshold?: number;
      }>("/agent-config")
      .then((cfg) => {
        if (cfg.isActive !== undefined) setIsActive(cfg.isActive);
        if (cfg.defaultLanguage) setLanguage(cfg.defaultLanguage);
        if (cfg.tone) setTone(cfg.tone);
        if (cfg.followUpDelays?.length === 3) {
          setDelay1(String(cfg.followUpDelays[0]));
          setDelay2(String(cfg.followUpDelays[1]));
          setDelay3(String(cfg.followUpDelays[2]));
        }
        if (cfg.maxFollowUps !== undefined) setMaxFollowUps(String(cfg.maxFollowUps));
        if (cfg.templates) setTemplates({ ...DEFAULT_TEMPLATES, ...cfg.templates });
        if (cfg.escalationThreshold !== undefined) setEscalationThreshold(String(cfg.escalationThreshold));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/agent-config", {
        isActive,
        defaultLanguage: language,
        tone,
        followUpDelays: [
          parseInt(delay1, 10),
          parseInt(delay2, 10),
          parseInt(delay3, 10),
        ],
        maxFollowUps: parseInt(maxFollowUps, 10),
        templates,
        escalationThreshold: parseInt(escalationThreshold, 10),
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

  const placeholderButtons = [
    { key: "clientName", label: t('agent.placeholderClientName'), token: "{clientName}" },
    { key: "productName", label: t('agent.placeholderProductName'), token: "{productName}" },
    { key: "totalAmount", label: t('agent.placeholderTotalAmount'), token: "{totalAmount}" },
    { key: "wilaya", label: t('agent.placeholderWilaya'), token: "{wilaya}" },
    { key: "orderId", label: t('agent.placeholderOrderId'), token: "{orderId}" },
    { key: "shopName", label: t('agent.placeholderShopName'), token: "{shopName}" },
  ];

  const templateKeys = [
    { key: "orderConfirmation", label: t('agent.templateOrderConfirmation') },
    { key: "cartFollowUp", label: t('agent.templateCartFollowUp') },
    { key: "greeting", label: t('agent.templateGreeting') },
  ];

  const insertPlaceholder = (token: string) => {
    setTemplates((prev) => ({
      ...prev,
      [activeTemplate]: prev[activeTemplate] + token,
    }));
  };

  const previewTemplate = (templateKey: string) => {
    const template = templates[templateKey] || "";
    return template
      .replace(/\{clientName\}/g, "Ahmed Benali")
      .replace(/\{productName\}/g, "T-shirt Premium")
      .replace(/\{totalAmount\}/g, "4,500")
      .replace(/\{wilaya\}/g, "Alger")
      .replace(/\{orderId\}/g, "ORD-1234")
      .replace(/\{shopName\}/g, "Ma Boutique");
  };

  if (loading)
    return <div className="text-sm text-on-muted py-4">{t('loading', { ns: 'common' })}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on">{t('tabs.agent')}</h1>
        <p className="mt-1 text-sm text-on-muted">{t('agent.description')}</p>
      </div>

      {/* Section 1: Agent Status */}
      <Card>
        <h3 className="text-sm font-semibold text-on mb-3">{t('agent.status')}</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant={isActive ? "success" : "neutral"}>
              {isActive ? t('agent.enabled') : t('agent.disabled')}
            </Badge>
          </div>
          <button
            onClick={() => setIsActive(!isActive)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 ${
              isActive ? "bg-brand-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isActive ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </Card>

      {/* Section 2: Language & Tone */}
      <Card>
        <h3 className="text-sm font-semibold text-on mb-3">{t('agent.language')}</h3>
        <div className="space-y-4">
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
        </div>
      </Card>

      {/* Section 3: Message Templates */}
      <Card>
        <h3 className="text-sm font-semibold text-on mb-3">{t('agent.messageTemplates')}</h3>

        {/* Template selector tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {templateKeys.map((tk) => (
            <button
              key={tk.key}
              onClick={() => setActiveTemplate(tk.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTemplate === tk.key
                  ? "bg-brand-600 text-white"
                  : "bg-surface-secondary text-on-muted hover:text-on"
              }`}
            >
              {tk.label}
            </button>
          ))}
        </div>

        {/* Placeholder buttons */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {placeholderButtons.map((ph) => (
            <button
              key={ph.key}
              onClick={() => insertPlaceholder(ph.token)}
              className="px-2 py-1 text-xs font-medium rounded border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
              title={ph.token}
            >
              {ph.label}
            </button>
          ))}
        </div>

        {/* Template textarea */}
        <textarea
          value={templates[activeTemplate] || ""}
          onChange={(e) =>
            setTemplates((prev) => ({ ...prev, [activeTemplate]: e.target.value }))
          }
          rows={6}
          className="w-full rounded-md border border-on bg-surface text-on px-3 py-2 text-sm font-mono placeholder:text-on-faint focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
        />

        {/* Preview */}
        <div className="mt-3">
          <p className="text-xs font-medium text-on-muted mb-1.5">{t('agent.preview')}</p>
          <div className="rounded-md border border-on bg-surface-secondary p-3">
            <p className="text-sm text-on whitespace-pre-wrap">
              {previewTemplate(activeTemplate)}
            </p>
          </div>
        </div>

        {/* Reset to default */}
        <button
          onClick={() =>
            setTemplates((prev) => ({ ...prev, ...DEFAULT_TEMPLATES }))
          }
          className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          {t('agent.resetDefault')}
        </button>
      </Card>

      {/* Section 4: Follow-up Settings */}
      <Card>
        <h3 className="text-sm font-semibold text-on mb-3">{t('agent.followUpSettings')}</h3>
        <div className="space-y-4">
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
          </div>
          <div>
            <label className="block text-sm font-medium text-on-secondary mb-1.5">
              {t('agent.maxFollowUps')}
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={maxFollowUps}
              onChange={(e) => setMaxFollowUps(e.target.value)}
              className="w-20 h-10 rounded-md border border-on bg-surface text-on px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
        </div>
      </Card>

      {/* Section 5: Escalation */}
      <Card>
        <h3 className="text-sm font-semibold text-on mb-3">{t('agent.escalation')}</h3>
        <div>
          <label className="block text-sm font-medium text-on-secondary mb-1.5">
            {t('agent.escalationThreshold')}
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={escalationThreshold}
            onChange={(e) => setEscalationThreshold(e.target.value)}
            className="w-20 h-10 rounded-md border border-on bg-surface text-on px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <p className="mt-1 text-[13px] text-on-muted">{t('agent.escalationThresholdHint')}</p>
        </div>
      </Card>

      {/* Save button */}
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
        <div>
          <h1 className="text-2xl font-bold text-on">{t('tabs.store')}</h1>
          <p className="mt-1 text-sm text-on-muted">{t('store.description')}</p>
        </div>
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
      <div>
        <h1 className="text-2xl font-bold text-on">{t('tabs.store')}</h1>
        <p className="mt-1 text-sm text-on-muted">{t('store.description')}</p>
      </div>

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
  const { suppressDisconnectModal } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [connected, setConnected] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConnectOptions, setShowConnectOptions] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState("");

  const fetchStatus = async () => {
    try {
      const data = await api.get<{ status: string; phoneNumber: string | null; hasSession: boolean }>("/whatsapp/session/status");
      setConnected(data.status === "connected");
      setPhoneNumber(data.phoneNumber);
      setHasSession(data.hasSession);
    } catch {
      setConnected(false);
      setHasSession(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const connectQR = async () => {
    setActionLoading(true);
    setError("");
    try {
      const res = await api.post<{ qrBase64?: string; connected?: boolean }>(
        "/whatsapp/session",
        {},
      );
      if (res.connected) {
        setConnected(true);
        setShowConnectOptions(false);
        toast.success(t('whatsapp.connected'));
        return;
      }
      setQrBase64(res.qrBase64 ?? null);

      const poll = setInterval(async () => {
        try {
          const data = await api.get<{ status: string; phoneNumber: string | null }>("/whatsapp/session/status");
          if (data.status === "connected") {
            clearInterval(poll);
            setQrBase64(null);
            setConnected(true);
            setPhoneNumber(data.phoneNumber);
            setShowConnectOptions(false);
            toast.success(t('whatsapp.connected'));
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
      toast.error(t('whatsapp.connectionError'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    suppressDisconnectModal();
    try {
      await api.post("/whatsapp/session/disconnect");
      setConnected(false);
      setPhoneNumber(null);
      toast.success(t('whatsapp.sessionDeactivated'));
    } catch {
      toast.error(t('whatsapp.disconnectionError'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSession = async () => {
    setActionLoading(true);
    setShowDeleteConfirm(false);
    suppressDisconnectModal();
    try {
      await api.delete("/whatsapp/session");
      setConnected(false);
      setHasSession(false);
      setPhoneNumber(null);
      setShowConnectOptions(true);
      toast.success(t('whatsapp.sessionDeleted'));
    } catch {
      toast.error(t('whatsapp.disconnectionError'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    setError("");
    try {
      await api.post("/whatsapp/session/reconnect");

      const poll = setInterval(async () => {
        try {
          const data = await api.get<{ status: string; phoneNumber: string | null }>("/whatsapp/session/status");
          if (data.status === "connected") {
            clearInterval(poll);
            setConnected(true);
            setPhoneNumber(data.phoneNumber);
            setReconnecting(false);
            toast.success(t('whatsapp.connected'));
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
      toast.error(t('whatsapp.connectionError'));
      setReconnecting(false);
    }
  };

  if (loading)
    return <div className="text-sm text-on-muted py-4">{t('loading', { ns: 'common' })}</div>;

  if (qrBase64) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-on">{t('tabs.whatsapp')}</h1>
          <p className="mt-1 text-sm text-on-muted">{t('whatsapp.description')}</p>
        </div>
        <Card>
          <h3 className="text-sm font-semibold text-on mb-4">{t('whatsapp.scanQR')}</h3>
          <div className="flex flex-col items-center gap-4">
            <img src={`data:image/png;base64,${qrBase64}`} alt="QR" className="h-64 w-64" />
            <div className="flex items-center gap-2 text-sm text-on-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('whatsapp.waitingScan')}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setQrBase64(null); setActionLoading(false); }}>
              {t('cancel', { ns: 'common' })}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on">{t('tabs.whatsapp')}</h1>
        <p className="mt-1 text-sm text-on-muted">{t('whatsapp.description')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Session Status */}
          <Card>
            <h3 className="text-sm font-semibold text-on mb-4">{t('whatsapp.sessionStatus')}</h3>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-on">
                  {phoneNumber || t('whatsapp.noNumber')}
                </p>
                {phoneNumber && (
                  <p className="text-[13px] text-on-muted">{t('whatsapp.businessApp')}</p>
                )}
              </div>
              <Badge variant={connected ? "success" : "danger"}>
                {connected ? t('whatsapp.connected') : t('whatsapp.disconnected')}
              </Badge>
            </div>

            {connected && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" className="gap-2" onClick={handleDisconnect} loading={actionLoading}>
                  <Unplug className="h-4 w-4" />
                  {t('whatsapp.disconnectBtn')}
                </Button>
                <Button variant="secondary" className="gap-2 text-red-600 hover:text-red-700" onClick={() => setShowDeleteConfirm(true)} disabled={actionLoading}>
                  <Trash2 className="h-4 w-4" />
                  {t('whatsapp.deleteSession')}
                </Button>
              </div>
            )}

            {!connected && hasSession && (
              <Button variant="primary" className="gap-2" onClick={handleReconnect} loading={reconnecting}>
                <RefreshCw className="h-4 w-4" />
                {reconnecting ? t('whatsapp.reconnecting') : t('whatsapp.reconnect')}
              </Button>
            )}

            {!connected && !hasSession && !showConnectOptions && (
              <Button variant="primary" className="gap-2" onClick={() => setShowConnectOptions(true)}>
                <Phone className="h-4 w-4" />
                {t('whatsapp.connectWhatsApp')}
              </Button>
            )}

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </Card>

          {/* Connection Method (QR only) */}
          {showConnectOptions && !connected && (
            <Card>
              <h3 className="text-sm font-semibold text-on mb-4">{t('whatsapp.connectionMethod')}</h3>
              <div className="flex flex-col items-center gap-4">
                <Button variant="primary" className="gap-2" onClick={connectQR} loading={actionLoading}>
                  {t('whatsapp.generateQR')}
                </Button>
                <p className="text-xs text-on-muted text-center">{t('whatsapp.qrHint')}</p>
              </div>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <h3 className="text-sm font-semibold text-on mb-4">{t('whatsapp.sessionDetails')}</h3>
            <div className="space-y-3">
              <div>
                <p className="text-[13px] text-on-muted">{t('whatsapp.phoneNumber')}</p>
                <p className="text-sm font-medium text-on">{phoneNumber || '—'}</p>
              </div>
              <div>
                <p className="text-[13px] text-on-muted">{t('whatsapp.status')}</p>
                <p className={`text-sm font-medium ${connected ? 'text-green-600' : 'text-on-muted'}`}>
                  {connected ? t('whatsapp.connected') : t('whatsapp.disconnected')}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-on">{t('whatsapp.deleteSessionTitle')}</h2>
                <p className="mt-2 text-sm text-on-muted">{t('whatsapp.deleteSessionDesc')}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={actionLoading}>
                {t('cancel', { ns: 'common' })}
              </Button>
              <Button size="sm" variant="danger" onClick={handleDeleteSession} loading={actionLoading}>
                {t('whatsapp.deleteSession')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WilayaPricingTab() {
  const { t } = useTranslation('settings');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on">{t('tabs.wilaya')}</h1>
        <p className="mt-1 text-sm text-on-muted">{t('wilaya.description')}</p>
      </div>
      <p className="text-sm text-on-muted">
        {t('wilaya.title')}
      </p>
    </div>
  );
}

function DeliveryTab() {
  const { t } = useTranslation('settings');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectedProvider, setConnectedProvider] = useState<DeliveryProviderKey | null>(null);
  const [showConnectFor, setShowConnectFor] = useState<DeliveryProviderKey | null>(null);
  const [showDisconnectFor, setShowDisconnectFor] = useState<DeliveryProviderKey | null>(null);
  const [apiId, setApiId] = useState('');
  const [apiToken, setApiToken] = useState('');

  const PROVIDERS = DELIVERY_PROVIDERS;

  useEffect(() => {
    api.get<{ connected: boolean; provider: string | null }>('/delivery/status')
      .then((res) => setConnectedProvider(res.connected ? (res.provider as DeliveryProviderKey) : null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = async () => {
    if (!showConnectFor) return;
    const meta = getProviderMeta(showConnectFor);
    if (!meta) return;
    if (meta.credentialField !== 'apiToken' && !apiId) return;
    if (!apiToken) return;
    setSaving(true);
    try {
      await api.post('/delivery/connect', { provider: showConnectFor, apiId, apiToken });
      setConnectedProvider(showConnectFor);
      setShowConnectFor(null);
      setApiId('');
      setApiToken('');
      toast.success(t('delivery.saved'));
    } catch (err: any) {
      toast.error(err?.message || t('delivery.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await api.post('/delivery/disconnect', {});
      setConnectedProvider(null);
      setShowDisconnectFor(null);
      setApiId('');
      setApiToken('');
    } catch {} finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-on">{t('tabs.delivery')}</h1>
          <p className="mt-1 text-sm text-on-muted">{t('delivery.description')}</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-on-faint" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on">{t('tabs.delivery')}</h1>
        <p className="mt-1 text-sm text-on-muted">{t('delivery.description')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {PROVIDERS.map((p) => {
          const isConnected = p.available && connectedProvider === p.key;
          const isAvailable = p.available;

          return (
            <Card key={p.key} className="relative p-6 flex flex-col items-center gap-4 hover:shadow-md transition-shadow">
              <div className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-medium ${
                isConnected
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {isConnected ? t('delivery.connected') : isAvailable ? t('delivery.disconnected') : t('delivery.comingSoon')}
              </div>

              {p.logo ? (
                <img src={p.logo} alt={p.name} className="h-16 w-48 object-contain mt-6" />
              ) : (
                <div className="h-16 w-16 mt-6 rounded-xl bg-surface-secondary flex items-center justify-center">
                  <Truck className="h-8 w-8 text-on-faint" />
                </div>
              )}

              <h3 className="text-lg font-semibold text-on text-center">{p.name}</h3>

              {isConnected ? (
                <Button variant="secondary" onClick={() => setShowDisconnectFor(p.key)}>
                  {t('delivery.disconnect')}
                </Button>
              ) : isAvailable ? (
                <Button onClick={() => { setShowConnectFor(p.key); setApiId(''); setApiToken(''); }}>
                  {t('delivery.connect')}
                </Button>
              ) : (
                <Button variant="secondary" disabled>
                  {t('delivery.comingSoon')}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {showConnectFor && getProviderMeta(showConnectFor) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowConnectFor(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl border border-on">
            <button onClick={() => setShowConnectFor(null)} className="absolute top-4 right-4 text-on-faint hover:text-on">
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-on">{t('delivery.modalTitle', { provider: getProviderMeta(showConnectFor)!.name })}</h2>
            <div className="mt-4 space-y-3">
              {getProviderMeta(showConnectFor)!.credentialField !== 'apiToken' && (
                <Input
                  label={t('delivery.apiId')}
                  placeholder={t('delivery.apiIdPlaceholder')}
                  value={apiId}
                  onChange={(e) => setApiId(e.target.value)}
                />
              )}
              <Input
                label={t('delivery.apiToken')}
                type="password"
                autoComplete="new-password"
                placeholder={t('delivery.apiTokenPlaceholder')}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowConnectFor(null)} disabled={saving}>
                {t('delivery.cancel')}
              </Button>
              <Button onClick={handleConnect} loading={saving} disabled={!apiToken}>
                {t('delivery.connect')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDisconnectFor && getProviderMeta(showDisconnectFor) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDisconnectFor(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl border border-on">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
              <h2 className="text-lg font-semibold text-on">{t('delivery.disconnectTitle', { provider: getProviderMeta(showDisconnectFor)!.name })}</h2>
            </div>
            <p className="mt-2 text-sm text-on-muted">{t('delivery.disconnectDesc', { provider: getProviderMeta(showDisconnectFor)!.name })}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowDisconnectFor(null)} disabled={saving}>
                {t('delivery.cancel')}
              </Button>
              <Button variant="danger" onClick={handleDisconnect} loading={saving}>
                {t('delivery.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Settings() {
  const { t } = useTranslation('settings');
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab") as SettingsTab | null;

  const validTabs: SettingsTab[] = ["agent", "store", "whatsapp", "wilaya", "delivery"];
  const activeTab = urlTab && validTabs.includes(urlTab) ? urlTab : "agent";

  const content: Record<SettingsTab, React.ReactNode> = {
    agent: <AgentConfigTab />,
    store: <StoreConnectionTab />,
    whatsapp: <WhatsAppTab />,
    wilaya: <WilayaPricingTab />,
    delivery: <DeliveryTab />,
  };

  return (
    <div>
      {content[activeTab]}
    </div>
  );
}
