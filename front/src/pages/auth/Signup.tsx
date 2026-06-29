import { useState, useRef, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/Button.js";
import { Input } from "../../components/ui/Input.js";
import { useAuth } from "../../lib/auth.js";
import { getAuthErrorMessage } from "../../lib/auth-errors.js";
import type { ApiError } from "../../lib/api.js";

export function Signup() {
  const navigate = useNavigate();
  const { signup, verifyEmail, isLoading } = useAuth();
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [verificationError, setVerificationError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setError("");

    const fields: Record<string, string> = {};

    if (!shopName.trim()) {
      fields.shopName = "Le nom du magasin est requis";
    }
    if (password.length < 8) {
      fields.password = "Le mot de passe doit contenir au moins 8 caractères";
    }
    if (!/\d/.test(password)) {
      fields.password = fields.password
        ? "8 caractères min. et au moins 1 chiffre"
        : "Le mot de passe doit contenir au moins un chiffre";
    }
    if (password !== confirmPassword) {
      fields.confirmPassword = "Les mots de passe ne correspondent pas";
    }

    if (Object.keys(fields).length > 0) {
      setFieldErrors(fields);
      return;
    }

    try {
      await signup(shopName, email, password);
      setIsSuccess(true);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.errors) {
        const apiFields: Record<string, string> = {};
        for (const e of apiErr.errors) {
          apiFields[e.field] = e.message;
        }
        setFieldErrors(apiFields);
      }
      setError(getAuthErrorMessage(err));
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setVerificationError("");

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    const newCode = [...code];
    for (let i = 0; i < pasted.length; i++) {
      newCode[i] = pasted[i];
    }
    setCode(newCode);
    const nextIndex = Math.min(pasted.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleVerify = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setVerificationError("Veuillez entrer le code à 6 chiffres");
      return;
    }
    setVerificationError("");
    try {
      await verifyEmail(email, fullCode);
      navigate("/onboarding");
    } catch (err) {
      setVerificationError(getAuthErrorMessage(err));
    }
  };

  const handleResend = async () => {
    try {
      await signup(shopName, email, password);
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch {
      setVerificationError("Erreur lors de l'envoi du code");
    }
  };

  if (isSuccess) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="mb-8 flex flex-col items-center gap-2">
          <img
            src="/ecomAssistantLogo.svg"
            alt="EcomAssistant"
            className="h-9 w-9"
          />
          <span className="text-lg font-semibold text-gray-900">
            EcomAssistant
          </span>
        </div>
        <div className="w-full max-w-[440px] rounded-xl border border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Vérifiez votre email
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Un code de confirmation a été envoyé à <strong>{email}</strong>.
          </p>

          <div
            className="mt-6 flex justify-center gap-2"
            onPaste={handleCodePaste}
          >
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(i, e.target.value)}
                onKeyDown={(e) => handleCodeKeyDown(i, e)}
                className="h-12 w-11 rounded-md border border-gray-300 text-center text-lg font-semibold focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            ))}
          </div>

          {verificationError && (
            <p className="mt-3 text-sm text-red-600">{verificationError}</p>
          )}

          <Button
            onClick={handleVerify}
            loading={isLoading}
            className="mt-6 w-full h-11"
          >
            Vérifier mon email
          </Button>

          <p className="mt-4 text-xs text-gray-500">
            Code non reçu ?{" "}
            <button
              onClick={handleResend}
              className="font-medium text-brand-600 hover:underline"
            >
              Renvoyer
            </button>
          </p>

          <button
            onClick={() => {
              setIsSuccess(false);
              setShopName("");
              setEmail("");
              setPassword("");
              setConfirmPassword("");
            }}
            className="mt-3 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Modifier l'adresse email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <img
          src="/ecomAssistantLogo.svg"
          alt="EcomAssistant"
          className="h-9 w-9"
        />
        <span className="text-lg font-semibold text-gray-900">
          EcomAssistant
        </span>
      </div>

      <div className="w-full max-w-[440px] rounded-xl border border-gray-200 bg-white p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Créer un compte</h1>
          <p className="mt-1 text-sm text-gray-500">
            Commencez votre essai gratuit de 14 jours
          </p>
        </div>

        {error && !fieldErrors[Object.keys(fieldErrors)[0]] && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nom du magasin"
            type="text"
            placeholder="Mon Magasin"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            error={fieldErrors.shopName}
            required
          />
          <Input
            label="Email"
            type="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            required
          />
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[13px] font-medium text-gray-700">
                Mot de passe
              </label>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 caractères, 1 chiffre"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={`block w-full h-10 rounded-md border px-[10px] py-[10px] text-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 pr-10 ${
                  fieldErrors.password
                    ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[13px] font-medium text-gray-700">
                Confirmer le mot de passe
              </label>
            </div>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                placeholder="Répétez le mot de passe"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={`block w-full h-10 rounded-md border px-[10px] py-[10px] text-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 pr-10 ${
                  fieldErrors.confirmPassword
                    ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>
          <Button type="submit" loading={isLoading} className="w-full h-11">
            Créer mon compte
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Déjà un compte ?{" "}
          <Link
            to="/login"
            className="font-medium text-brand-600 hover:text-brand-500"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
