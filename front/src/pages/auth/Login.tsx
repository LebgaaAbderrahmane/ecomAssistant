import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "../../components/ui/Button.js";
import { Input } from "../../components/ui/Input.js";
import { useAuth } from "../../lib/auth.js";
import { getAuthErrorMessage } from "../../lib/auth-errors.js";
import type { ApiError } from "../../lib/api.js";
import { useTranslation } from 'react-i18next';

export function Login() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { t } = useTranslation('auth');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.errors) {
        const fields: Record<string, string> = {};
        for (const e of apiErr.errors) {
          fields[e.field] = e.message;
        }
        setFieldErrors(fields);
      }
      setError(getAuthErrorMessage(err));
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-secondary px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <img
          src="/ecomAssistantLogo.svg"
          alt="EcomAssistant"
          className="h-9 w-9"
        />
        <span className="text-lg font-semibold text-on">
          EcomAssistant
        </span>
      </div>

      <div className="w-full max-w-[440px] rounded-xl border border-on bg-surface p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-on">{t('login.title')}</h1>
          <p className="mt-1 text-sm text-on-muted">
            {t('login.subtitle')}
          </p>
        </div>

        {error && !fieldErrors[Object.keys(fieldErrors)[0]] && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t('login.emailLabel')}
            type="email"
            placeholder={t('login.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            required
          />

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[13px] font-medium text-on-secondary">
                {t('login.passwordLabel')}
              </label>
              <Link
                to="/forgot-password"
                className="text-[13px] font-medium text-brand-600 hover:underline"
              >
                {t('login.forgotPassword')}
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`block w-full h-10 rounded-md border px-[10px] py-[10px] text-sm transition-colors bg-surface text-on placeholder:text-on-faint focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 pr-10 ${
                  fieldErrors.password
                    ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                    : "border-on"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-faint hover:text-on-secondary"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <Button type="submit" loading={isLoading} className="w-full h-11">
            {t('login.submit')}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 border-t border-on" />
          <span className="text-sm text-on-faint">{t('login.or')}</span>
          <div className="flex-1 border-t border-on" />
        </div>

        <button
          type="button"
          onClick={() => {
            window.location.href = '/auth/google';
          }}
          className="flex w-full h-11 items-center justify-center gap-2 rounded-md border border-on bg-surface text-sm font-medium text-on-secondary hover:bg-surface-secondary transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {t('login.google')}
        </button>

        <p className="mt-6 text-center text-sm text-on-muted">
          {t('login.noAccount')}{" "}
          <Link
            to="/signup"
            className="font-medium text-brand-600 hover:text-brand-500"
          >
            {t('login.createAccount')}
          </Link>
        </p>
      </div>
    </div>
  );
}
