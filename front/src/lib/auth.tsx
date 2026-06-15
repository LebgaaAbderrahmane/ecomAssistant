import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { api } from './api.js'

interface User {
  id: string
  email: string
  name: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

function createDevSession(email: string, name?: string) {
  const user: User = { id: 'dev-1', email, name: name || email.split('@')[0] }
  const token = 'dev-mock-token-' + Date.now()
  return { user, token }
}

function persistSession(data: { user: User; token: string }) {
  localStorage.setItem('token', data.token)
  localStorage.setItem('user', JSON.stringify(data.user))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [isLoading, setIsLoading] = useState(false)

  const devLogin = useCallback((email: string, name?: string) => {
    const session = createDevSession(email, name)
    persistSession(session)
    setToken(session.token)
    setUser(session.user)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true)
    try {
      if (import.meta.env.VITE_DEV_AUTH === 'true') {
        devLogin(email)
        return
      }
      const data = await api.post<{ user: User; token: string }>('/auth/login', { email, password })
      persistSession(data)
      setToken(data.token)
      setUser(data.user)
    } catch (err) {
      if (err instanceof Error && (err.message.includes('Erreur 5') || err.message === 'Failed to fetch')) {
        console.warn('Backend unavailable, falling back to dev auth')
        devLogin(email)
        return
      }
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [devLogin])

  const signup = useCallback(async (name: string, email: string, password: string) => {
    setIsLoading(true)
    try {
      if (import.meta.env.VITE_DEV_AUTH === 'true') {
        devLogin(email, name)
        return
      }
      const data = await api.post<{ user: User; token: string }>('/auth/signup', { name, email, password })
      persistSession(data)
      setToken(data.token)
      setUser(data.user)
    } catch (err) {
      if (err instanceof Error && (err.message.includes('Erreur 5') || err.message === 'Failed to fetch')) {
        console.warn('Backend unavailable, falling back to dev auth')
        devLogin(email, name)
        return
      }
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [devLogin])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
