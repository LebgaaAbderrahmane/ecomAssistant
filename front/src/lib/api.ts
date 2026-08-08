const BASE_URL = ''

export class ApiError extends Error {
  status: number
  errors?: { field: string; message: string }[]

  constructor(message: string, status: number, errors?: { field: string; message: string }[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

// CSRF token
function getCSRFToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/)
  return match ? match[1] : null
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  const userStr = localStorage.getItem('user')
  if (!userStr) return false

  const merchantId = JSON.parse(userStr).id
  if (!merchantId) return false

  try {
    const csrfToken = getCSRFToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken

    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers,
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
  const csrfToken = getCSRFToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }

  if (csrfToken && options.method && options.method !== 'GET') {
    headers['X-CSRF-Token'] = csrfToken
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
        const retryCsrf = getCSRFToken()
        const retryHeaders = { ...headers }
        if (retryCsrf) retryHeaders['X-CSRF-Token'] = retryCsrf
        const retryRes = await fetch(`${BASE_URL}${path}`, { ...options, headers: retryHeaders, credentials: 'include' })
        if (retryRes.ok) {
          return retryRes.json()
        }
        const body = await retryRes.json().catch(() => ({}))
        throw new ApiError(
          body.message || `Erreur ${retryRes.status}`,
          retryRes.status,
          body.errors,
        )
      }

      clearSession()
    }

    const body = await res.json().catch(() => ({}))
    throw new ApiError(
      body.message || `Erreur ${res.status}`,
      res.status,
      body.errors,
    )
  }

  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
