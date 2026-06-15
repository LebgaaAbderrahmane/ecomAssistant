import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Globe } from 'lucide-react'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'
import { useAuth } from '../../lib/auth.js'

export function Login() {
  const navigate = useNavigate()
  const { login, isLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <img src="/ecomAssistantLogo.svg" alt="EcomAssistant" className="h-9 w-9" />
        <span className="text-lg font-semibold text-gray-900">EcomAssistant</span>
      </div>

      <div className="w-full max-w-[440px] rounded-xl border border-gray-200 bg-white p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Connexion</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connectez-vous pour gérer votre agent WhatsApp
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[13px] font-medium text-gray-700">Mot de passe</label>
              <Link to="/forgot-password" className="text-[13px] font-medium text-brand-600 hover:underline">
                Mot de passe oublié ?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="block w-full h-10 rounded-md border border-gray-300 px-[10px] py-[10px] text-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Rester connecté
          </label>

          <Button type="submit" loading={isLoading} className="w-full h-11">
            Se connecter
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-sm text-gray-400">ou</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        <button
          type="button"
          className="flex w-full h-11 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Globe className="h-4 w-4" />
          Continuer avec Google
        </button>

        <p className="mt-6 text-center text-sm text-gray-500">
          Nouveau sur EcomAssistant ?{' '}
          <Link to="/signup" className="font-medium text-brand-600 hover:text-brand-500">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  )
}
