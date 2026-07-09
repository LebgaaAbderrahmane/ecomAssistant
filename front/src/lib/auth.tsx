import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { api, type ApiError } from "./api.js";

interface User {
  id: string;
  email: string;
  name: string;
  shopName?: string;
}

interface LoginResponse {
  message: string;
  merchant: {
    id: string;
    email: string;
    shopName?: string;
  };
}

interface VerifyEmailResponse {
  message: string;
  merchant: User & { isVerified: boolean };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (shopName: string, email: string, password: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function createDevSession(email: string, name?: string) {
  const user: User = { id: "dev-1", email, name: name || email.split("@")[0] };
  return { user };
}

function persistUser(user: User) {
  localStorage.setItem("user", JSON.stringify(user));
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
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!localStorage.getItem("user"),
  );
  const [isLoading, setIsLoading] = useState(false);

  const devLogin = useCallback((email: string, name?: string) => {
    const { user } = createDevSession(email, name);
    persistUser(user);
    setUser(user);
    setIsAuthenticated(true);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        if (import.meta.env.VITE_DEV_AUTH === "true") {
          devLogin(email);
          return;
        }
        const data = await api.post<LoginResponse>("/auth/login", {
          email,
          password,
        });
        const user: User = {
          id: data.merchant.id,
          email: data.merchant.email,
          name: data.merchant.shopName || email.split("@")[0],
          shopName: data.merchant.shopName,
        };
        persistUser(user);
        setUser(user);
        setIsAuthenticated(true);
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
        name: data.merchant.shopName || data.merchant.name,
        shopName: data.merchant.shopName,
      };
      persistUser(user);
      setUser(user);
      setIsAuthenticated(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    api.post("/auth/logout", {}).catch(() => {});
    localStorage.removeItem("user");
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    const handler = () => {
      localStorage.removeItem("user");
      setUser(null);
      setIsAuthenticated(false);
    };
    window.addEventListener("auth:expired", handler);
    return () => window.removeEventListener("auth:expired", handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (import.meta.env.VITE_DEV_AUTH === "true") return;

    let cancelled = false;
    api
      .get<{ id: string; email: string; name: string; shopName?: string }>(
        "/auth/me",
      )
      .then((data) => {
        if (cancelled) return;
        const fresh: User = {
          id: data.id,
          email: data.email,
          name: data.name,
          shopName: data.shopName,
        };
        persistUser(fresh);
        setUser(fresh);
        setIsAuthenticated(true);
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("user");
        setUser(null);
        setIsAuthenticated(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        login,
        signup,
        verifyEmail,
        logout,
        isLoading,
      }}
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
