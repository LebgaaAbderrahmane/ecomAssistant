import { useState, useEffect, useRef } from "react";
import {
  Search,
  Phone,
  Send,
  Loader2,
  MessageSquare,
  ArrowLeft,
} from "lucide-react";
import { Badge } from "../../components/ui/Badge.js";
import { Button } from "../../components/ui/Button.js";
import { api } from "../../lib/api.js";

type FilterTab =
  | "all"
  | "active"
  | "waiting"
  | "confirmed"
  | "cancelled"
  | "escalated"
  | "expired";

interface OrderSummary {
  customerName: string;
  customerPhone: string;
  productName: string;
  totalAmount: number;
  status: string;
}

interface MessageItem {
  id: string;
  role: string;
  content: string;
  contentType: string;
  createdAt: string;
}

interface ConversationItem {
  id: string;
  customerPhone: string;
  status: string;
  language: string;
  lastMessageAt: string | null;
  createdAt: string;
  order: OrderSummary;
  messages: MessageItem[];
}

interface ConversationDetail extends ConversationItem {
  messages: MessageItem[];
}

interface ListResponse {
  data: ConversationItem[];
  pagination: { total: number; hasMore: boolean; nextOffset: number | null };
}

const filterTabs: { id: FilterTab; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "active", label: "Actives" },
  { id: "waiting", label: "En attente" },
  { id: "confirmed", label: "Confirmées" },
  { id: "escalated", label: "Escaladées" },
  { id: "cancelled", label: "Annulées" },
];

const statusVariant: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  confirmed: "success",
  active: "info",
  waiting: "warning",
  escalated: "danger",
  cancelled: "neutral",
  expired: "neutral",
};

const statusLabels: Record<string, string> = {
  confirmed: "Confirmée",
  active: "Active",
  waiting: "En attente",
  escalated: "Escaladée",
  cancelled: "Annulée",
  expired: "Expirée",
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600 shrink-0">
      {initial}
    </div>
  );
}

function LangBadge({ lang }: { lang: string }) {
  const label: Record<string, string> = {
    derdja: "DZ",
    french: "FR",
    arabic: "AR",
    auto: "--",
  };
  return (
    <span className="inline-flex h-5 w-7 items-center justify-center rounded-[4px] bg-gray-100 text-[11px] font-bold tracking-wider text-gray-700">
      {label[lang] || lang.slice(0, 2).toUpperCase()}
    </span>
  );
}

function ConversationList({
  conversations,
  selectedId,
  loading,
  hasMore,
  total,
  onSelect,
  onLoadMore,
}: {
  conversations: ConversationItem[];
  selectedId: string | null;
  loading: boolean;
  hasMore: boolean;
  total: number;
  onSelect: (c: ConversationItem) => void;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-5 py-3 border-b border-gray-100">
        <p className="text-xs text-gray-400">
          {total} conversation{total > 1 ? "s" : ""}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Chargement...
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-sm text-gray-400 px-5">
            <MessageSquare className="h-6 w-6 mb-2" />
            Aucune conversation
          </div>
        ) : (
          conversations.map((conv) => {
            const isSelected = conv.id === selectedId;
            const lastMsg = conv.messages[0];
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={`w-full text-left px-5 py-3 border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                  isSelected
                    ? "bg-brand-50/40 border-l-2 border-l-brand-600"
                    : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <Avatar name={conv.order.customerName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {conv.order.customerName}
                      </span>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {timeAgo(conv.lastMessageAt || conv.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Phone className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {conv.customerPhone}
                      </span>
                    </div>
                    {lastMsg && (
                      <p className="text-xs text-gray-400 truncate mt-1">
                        {lastMsg.content}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant={statusVariant[conv.status] || "neutral"}>
                        {statusLabels[conv.status] || conv.status}
                      </Badge>
                      <LangBadge lang={conv.language} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
        {hasMore && (
          <div className="p-3 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              loading={loading}
            >
              Charger plus
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatView({
  conversation,
  onBack,
}: {
  conversation: ConversationDetail;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<MessageItem[]>(
    conversation.messages,
  );
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(conversation.messages);
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await api.post("/whatsapp/send", {
        conversationId: conversation.id,
        text: text.trim(),
      });
      const optimistic: MessageItem = {
        id: `opt-${Date.now()}`,
        role: "agent",
        content: text.trim(),
        contentType: "text",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setText("");
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-gray-200">
        <button onClick={onBack} className="lg:hidden mr-1">
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <Avatar name={conversation.order.customerName} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {conversation.order.customerName}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {conversation.order.productName} ·{" "}
            {conversation.order.totalAmount.toLocaleString("fr-FR")} DA
          </p>
        </div>
        <Badge variant={statusVariant[conversation.status] || "neutral"}>
          {statusLabels[conversation.status] || conversation.status}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((msg) => {
          const isAgent = msg.role === "agent";
          return (
            <div
              key={msg.id}
              className={`flex ${isAgent ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                  isAgent
                    ? "bg-brand-600 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-900 rounded-bl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <p
                  className={`text-[10px] mt-1 ${
                    isAgent ? "text-brand-200" : "text-gray-400"
                  }`}
                >
                  {new Date(msg.createdAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-gray-200 px-5 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Écrivez un message..."
            rows={1}
            className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 min-h-[40px] max-h-[120px]"
          />
          <Button
            size="sm"
            onClick={handleSend}
            loading={sending}
            disabled={!text.trim()}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Conversations() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState({
    total: 0,
    hasMore: false,
    nextOffset: null as number | null,
  });

  const fetchList = async (append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeFilter !== "all") params.set("status", activeFilter);
      if (search) params.set("search", search);
      if (append && pagination.nextOffset !== null)
        params.set("offset", String(pagination.nextOffset));
      params.set("limit", "20");

      const res = await api.get<ListResponse>(
        `/whatsapp/conversations?${params}`,
      );
      if (append) {
        setConversations((prev) => [...prev, ...res.data]);
      } else {
        setConversations(res.data);
      }
      setPagination(res.pagination);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [activeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!search) return;
      fetchList();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSelect = async (conv: ConversationItem) => {
    setLoadingDetail(true);
    try {
      const detail = await api.get<ConversationDetail>(
        `/whatsapp/conversations/${conv.id}`,
      );
      setSelected(detail);
    } catch {
      setSelected(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleFilterChange = (tab: FilterTab) => {
    setActiveFilter(tab);
    setSelected(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="shrink-0 flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
        </div>
      </div>

      <div className="flex-1 flex rounded-lg border border-gray-200 bg-white overflow-hidden min-h-0">
        <div className="w-full lg:w-[400px] shrink-0 border-r border-gray-200 flex flex-col">
          <div className="shrink-0 px-5 pt-4 pb-2 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Rechercher par nom ou téléphone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full h-9 rounded-md border border-gray-300 pl-[34px] pr-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
              />
            </div>
            <div
              className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onWheel={(e) => {
                if (e.deltaY !== 0) {
                  e.preventDefault();
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
            >
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleFilterChange(tab.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    activeFilter === tab.id
                      ? "bg-brand-600 text-white"
                      : "border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <ConversationList
              conversations={conversations}
              selectedId={selected?.id || null}
              loading={loading}
              hasMore={pagination.hasMore}
              total={pagination.total}
              onSelect={handleSelect}
              onLoadMore={() => fetchList(true)}
            />
          </div>
        </div>

        <div className="hidden lg:flex flex-1 flex-col min-w-0">
          {loadingDetail ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Chargement...
            </div>
          ) : selected ? (
            <ChatView
              conversation={selected}
              onBack={() => setSelected(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 px-8">
              <MessageSquare className="h-12 w-12 mb-3" />
              <p className="text-sm font-medium">
                Sélectionnez une conversation
              </p>
              <p className="text-xs mt-1">
                Choisissez une conversation dans la liste pour voir les messages
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: show detail full-width when selected */}
      {selected && (
        <div className="lg:hidden fixed inset-0 top-14 z-40 bg-white">
          <ChatView conversation={selected} onBack={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}
