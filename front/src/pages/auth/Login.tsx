import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Globe } from "lucide-react";
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
          className="flex w-full h-11 items-center justify-center gap-2 rounded-md border border-on bg-surface text-sm font-medium text-on-secondary hover:bg-surface-secondary transition-colors"
        >
          <Globe className="h-4 w-4" />
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
