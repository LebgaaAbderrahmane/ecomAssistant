import { config } from "../../config";

const BASE = config.openwaUrl.replace(/\/+$/, "") + "/api";
const API_KEY = config.openwaApiKey;

interface OpenwaResponse<T = unknown> {
  status: "success" | "error";
  data?: T;
  message?: string;
}

class OpenwaError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "OpenwaError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {
    "X-API-Key": API_KEY,
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json().catch(() => ({}))) as OpenwaResponse<T>;

  if (!res.ok) {
    throw new OpenwaError(
      json.message || `OpenWA request failed: ${res.status}`,
      res.status,
    );
  }

  return (json.data ?? json) as T;
}

function stripSuffix(phone: string): string {
  return phone.replace(/@[a-z.]+$/g, "");
}

function addSuffix(phone: string): string {
  const clean = phone.replace(/^\+/, "").replace(/@[a-z.]+$/g, "");
  return `${clean}@c.us`;
}

export interface Session {
  id: string;
  name: string;
  status: string;
}

export interface SessionQR {
  qrCode: string;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
}

export interface SendResult {
  messageId: string;
}

export const openwaService = {
  createSession: async (name: string): Promise<Session> => {
    return request<Session>("POST", "/sessions", { name });
  },

  startSession: async (sessionId: string): Promise<void> => {
    await request("POST", `/sessions/${sessionId}/start`);
  },

  stopSession: async (sessionId: string): Promise<void> => {
    await request("POST", `/sessions/${sessionId}/stop`);
  },

  logoutSession: async (sessionId: string): Promise<void> => {
    await request("POST", `/sessions/${sessionId}/logout`);
  },

  getQR: async (sessionId: string): Promise<string> => {
    const result = await request<SessionQR>("GET", `/sessions/${sessionId}/qr`);
    return result.qrCode;
  },

  getSession: async (sessionId: string): Promise<Session> => {
    return request<Session>("GET", `/sessions/${sessionId}`);
  },

  sendText: async (
    sessionId: string,
    to: string,
    text: string,
  ): Promise<SendResult> => {
    return request<SendResult>(
      "POST",
      `/sessions/${sessionId}/messages/send-text`,
      {
        chatId: addSuffix(to),
        text,
      },
    );
  },

  registerWebhook: async (
    sessionId: string,
    url: string,
    events: string[],
    secret: string,
  ): Promise<Webhook> => {
    return request<Webhook>("POST", `/sessions/${sessionId}/webhooks`, {
      url,
      events,
      secret,
    });
  },

  deleteWebhook: async (
    sessionId: string,
    webhookId: string,
  ): Promise<void> => {
    await request("DELETE", `/sessions/${sessionId}/webhooks/${webhookId}`);
  },

  listWebhooks: async (sessionId: string): Promise<Webhook[]> => {
    const result = await request<Webhook[]>(
      "GET",
      `/sessions/${sessionId}/webhooks`,
    );
    return Array.isArray(result) ? result : [];
  },

  listSessions: async (): Promise<Session[]> => {
    const result = await request<Session[]>("GET", "/sessions");
    return Array.isArray(result) ? result : [];
  },

  deleteSession: async (sessionId: string): Promise<void> => {
    await request("DELETE", `/sessions/${sessionId}`);
  },

  checkPhone: async (sessionId: string, phone: string): Promise<boolean> => {
    try {
      const result = await request<{ exists: boolean }>(
        "GET",
        `/sessions/${sessionId}/contacts/check/${stripSuffix(phone)}`,
      );
      return result.exists;
    } catch {
      return false;
    }
  },

  getPairingCode: async (sessionId: string, phoneNumber: string): Promise<string> => {
    const result = await request<{ code: string }>(
      "POST",
      `/sessions/${sessionId}/pairing-code`,
      { phoneNumber: stripSuffix(phoneNumber) },
    );
    return result.code;
  },

  stripSuffix,
  addSuffix,
};

export { OpenwaError };
