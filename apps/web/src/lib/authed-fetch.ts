import { tokenStorage } from "./token-storage"

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ""

let refreshing: Promise<boolean> | null = null

/** Refresh the access token from the stored refresh token. Deduped: concurrent
 * callers share one in-flight refresh — critical because the backend rotates and
 * blacklists refresh tokens, so two concurrent refreshes would invalidate each
 * other. Shared by both the typed openapi client (lib/api.ts) and authedFetch. */
export async function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing
  const refresh = tokenStorage.getRefresh()
  if (!refresh) return false

  refreshing = (async () => {
    try {
      const resp = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      })
      if (!resp.ok) return false
      const body = await resp.json()
      tokenStorage.set(body.access_token, body.refresh_token)
      return true
    } finally {
      refreshing = null
    }
  })()

  return refreshing
}

/** `fetch()` with the access token attached plus a shared 401 → refresh → retry-once,
 * for modules that use raw fetch instead of the typed openapi client. Without it,
 * such requests (e.g. the notifications poller) keep 401-ing on token expiry while the
 * rest of the app silently refreshes; N concurrent 401s now share one refresh and all
 * retry, so the "401 storm" collapses. */
export async function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const build = (): RequestInit => {
    const headers = new Headers(options.headers)
    const token = tokenStorage.getAccess()
    if (token) headers.set("Authorization", `Bearer ${token}`)
    return { ...options, headers }
  }

  const resp = await fetch(url, build())
  if (resp.status !== 401 || url.endsWith("/auth/refresh") || url.endsWith("/auth/login")) {
    return resp
  }

  const ok = await refreshTokens()
  if (!ok) return resp
  return fetch(url, build())
}
