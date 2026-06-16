import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { api, type ApiError } from "./api.js";

interface User {
  id: string;
  email: string;
  name: string;
  shop?: { shopName: string };
}

interface VerifyEmailResponse {
  message: string;
  accessToken: string;
  merchant: User & { isVerified: boolean; shop?: { shopName: string } };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (shopName: string, email: string, password: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function createDevSession(email: string, name?: string) {
  const user: User = { id: "dev-1", email, name: name || email.split("@")[0] };
  const token = "dev-mock-token-" + Date.now();
  return { user, token };
}

function persistSession(data: { user: User; token: string }) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
}

function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "message" in err
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("token"),
  );
  const [isLoading, setIsLoading] = useState(false);

  const devLogin = useCallback((email: string, name?: string) => {
    const session = createDevSession(email, name);
    persistSession(session);
    setToken(session.token);
    setUser(session.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        if (import.meta.env.VITE_DEV_AUTH === "true") {
          devLogin(email);
          return;
        }
        const data = await api.post<{ user: User; token: string }>(
          "/auth/login",
          { email, password },
        );
        persistSession(data);
        setToken(data.token);
        setUser(data.user);
      } catch (err) {
        if (isApiError(err)) throw err;
        if (
          err instanceof Error &&
          (err.message.includes("Erreur 5") ||
            err.message === "Failed to fetch")
        ) {
          console.warn("Backend unavailable, falling back to dev auth");
          devLogin(email);
          return;
        }
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [devLogin],
  );

  const signup = useCallback(
    async (shopName: string, email: string, password: string) => {
      setIsLoading(true);
      try {
        if (import.meta.env.VITE_DEV_AUTH === "true") {
          devLogin(email, shopName);
          return;
        }
        await api.post("/auth/signup", { shopName, email, password });
      } catch (err) {
        if (isApiError(err)) throw err;
        if (
          err instanceof Error &&
          (err.message.includes("Erreur 5") ||
            err.message === "Failed to fetch")
        ) {
          console.warn("Backend unavailable, falling back to dev auth");
          devLogin(email, shopName);
          return;
        }
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [devLogin],
  );

  const verifyEmail = useCallback(async (email: string, code: string) => {
    setIsLoading(true);
    try {
      const data = await api.post<VerifyEmailResponse>("/auth/verify-email", {
        email,
        code,
      });
      const user: User = {
        id: data.merchant.id,
        email: data.merchant.email,
        name: data.merchant.name,
        shop: data.merchant.shop,
      };
      persistSession({ user, token: data.accessToken });
      setToken(data.accessToken);
      setUser(user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, login, signup, verifyEmail, logout, isLoading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
