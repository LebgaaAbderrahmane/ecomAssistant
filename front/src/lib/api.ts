const BASE_URL = ''

export interface ApiError {
  message: string
  status: number
  errors?: { field: string; message: string }[]
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  const userStr = localStorage.getItem('user')
  if (!userStr) return false

  const merchantId = JSON.parse(userStr).id
  if (!merchantId) return false

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ merchantId }),
    })
    return res.ok
  } catch {
    return false
  }
}

function clearSession() {
  localStorage.removeItem('user')
  window.dispatchEvent(new CustomEvent('auth:expired'))
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/refresh') {
      if (!refreshPromise) {
        refreshPromise = tryRefreshToken()
      }
      const refreshed = await refreshPromise
      refreshPromise = null

      if (refreshed) {
        const retryRes = await fetch(`${BASE_URL}${path}`, { ...options, headers, credentials: 'include' })
        if (retryRes.ok) {
          return retryRes.json()
        }
        const body = await retryRes.json().catch(() => ({}))
        const error: ApiError = {
          message: body.message || `Erreur ${retryRes.status}`,
          status: retryRes.status,
          errors: body.errors,
        }
        throw error
      }

      clearSession()
    }

    const body = await res.json().catch(() => ({}))
    const error: ApiError = {
      message: body.message || `Erreur ${res.status}`,
      status: res.status,
      errors: body.errors,
    }
    throw error
  }

  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
