# HRMS M1c — Frontend Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the React frontend against the M1b auth API. After this plan: a user navigates to `/login`, enters email + password (+ TOTP if MFA enabled), lands on a logged-in shell that shows their email + permissions and lets them log out. Refresh-token silent renewal keeps them signed in across page reloads. Permission gating works via `useCan(perm)` and `<RouteGuard perms={[...]}>`.

**Architecture:**
- API client = `openapi-fetch` consuming `packages/contracts/generated.ts` (already in place from M0).
- `AuthContext` holds `{user, perms: Set<string>, login, logout, refresh}`. Tokens live in memory + a refresh-token cookie / localStorage (we use localStorage for Phase 1 since it's simpler; Phase 2 may switch to httpOnly cookies).
- `<SignedOutGate>` redirects to `/login` if no user; `<RouteGuard perms={[...]}>` wraps protected screens.
- Refresh-token silent timer: ~1 minute before access-token expiry, the client calls `/auth/refresh` and swaps in the new tokens.
- 401 from any other endpoint triggers an immediate refresh attempt; on success retry; on fail logout.

**Tech Stack:** Same as M0 — React 18, Vite, React Router v6, TanStack Query, Zod, React Hook Form, shadcn/ui, biome, vitest. New install: `openapi-fetch` (was added in M0 contract scaffold but never wired).

**Branch:** `m1/identity-rbac` (current). Do NOT switch.

---

## File structure

```
apps/web/src/
├── lib/
│   ├── api.ts                      ← openapi-fetch client + auth header injector + 401 retry
│   ├── auth.tsx                    ← AuthContext + AuthProvider + useAuth
│   ├── perm.ts                     ← useCan hook
│   └── token-storage.ts            ← read/write/clear access+refresh tokens
├── modules/
│   └── auth/
│       ├── routes.tsx
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   └── MFAChallengePage.tsx
│       └── components/
│           └── LoginForm.tsx
├── components/
│   ├── RouteGuard.tsx
│   ├── SignedOutGate.tsx
│   └── shell/
│       ├── AppShell.tsx
│       └── TopBar.tsx
├── App.tsx                         ← updated to compose providers + routes
├── main.tsx                        ← unchanged
└── pages/
    └── HomePage.tsx                ← simple landing page showing user's email + perms
```

Tests live alongside in `*.test.tsx` files.

---

## Task 1: API client + token storage

**Files:**
- Create: `apps/web/src/lib/token-storage.ts`
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/api.test.ts`

- [ ] **Step 1: Install `openapi-fetch` in the web app**

```
cd apps/web && pnpm add openapi-fetch && cd ../..
```
Verify: `apps/web/package.json` now has `openapi-fetch` in dependencies.

- [ ] **Step 2: Create `apps/web/src/lib/token-storage.ts`**

```typescript
const ACCESS_KEY = "hrms.access_token"
const REFRESH_KEY = "hrms.refresh_token"

export const tokenStorage = {
  getAccess(): string | null {
    return localStorage.getItem(ACCESS_KEY)
  },
  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}
```

- [ ] **Step 3: Create `apps/web/src/lib/api.ts`**

```typescript
import createClient from "openapi-fetch"

import type { paths } from "@hrms/contracts/generated"
import { tokenStorage } from "./token-storage"

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"

let refreshing: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
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

const baseClient = createClient<paths>({ baseUrl: BASE_URL })

baseClient.use({
  async onRequest({ request }) {
    const token = tokenStorage.getAccess()
    if (token) request.headers.set("Authorization", `Bearer ${token}`)
    return request
  },
  async onResponse({ request, response }) {
    if (response.status !== 401) return response
    if (request.url.endsWith("/auth/login") || request.url.endsWith("/auth/refresh")) {
      return response  // don't retry login/refresh failures
    }
    const ok = await refreshTokens()
    if (!ok) return response
    // Retry the original request with the new token
    const token = tokenStorage.getAccess()
    const retryHeaders = new Headers(request.headers)
    if (token) retryHeaders.set("Authorization", `Bearer ${token}`)
    return fetch(request.url, {
      method: request.method,
      headers: retryHeaders,
      body: request.body,
    })
  },
})

export const api = baseClient
```

Note: the `paths` import path may need adjustment based on how `packages/contracts` is resolved. In the workspace, `@hrms/contracts/generated` should resolve via the workspace setup. If it doesn't, fall back to a relative path: `import type { paths } from "../../../packages/contracts/generated"`.

- [ ] **Step 4: Write a smoke test for the api client**

Create `apps/web/src/lib/api.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "./api"
import { tokenStorage } from "./token-storage"

describe("api client", () => {
  beforeEach(() => {
    tokenStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("attaches Authorization header when token is present", async () => {
    tokenStorage.set("test-access", "test-refresh")  // pragma: allowlist secret
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } })
    )
    await api.GET("/api/v1/auth/me" as any)
    const headers = (fetchSpy.mock.calls[0][0] as Request).headers
    expect(headers.get("Authorization")).toBe("Bearer test-access")
  })

  it("does not attach Authorization header when no token", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
    )
    await api.GET("/api/v1/auth/me" as any)
    const headers = (fetchSpy.mock.calls[0][0] as Request).headers
    expect(headers.get("Authorization")).toBeNull()
  })
})
```

- [ ] **Step 5: Run tests**

```
cd apps/web && pnpm test 2>&1 | tail -10; cd ../..
```
Expected: 4 tests pass (2 from M0 App.test.tsx + 2 new api tests).

- [ ] **Step 6: Commit Task 1**

```
git add apps/web/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): typed API client with token-storage + 401 refresh retry"
```

---

## Task 2: AuthContext + login flow

**Files:**
- Create: `apps/web/src/lib/auth.tsx`
- Create: `apps/web/src/lib/perm.ts`
- Create: `apps/web/src/modules/auth/routes.tsx`
- Create: `apps/web/src/modules/auth/pages/LoginPage.tsx`
- Create: `apps/web/src/modules/auth/components/LoginForm.tsx`
- Create: `apps/web/src/modules/auth/components/LoginForm.test.tsx`

- [ ] **Step 1: Add deps**

```
cd apps/web && pnpm add @tanstack/react-query react-hook-form react-router-dom zod && pnpm add -D msw && cd ../..
```

- [ ] **Step 2: Create `apps/web/src/lib/auth.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import { api } from "./api"
import { tokenStorage } from "./token-storage"

export interface AuthUser {
  id: string
  email: string
  org_id: string
  status: string
  mfa_enabled: boolean
  preferences: Record<string, unknown>
  permissions: string[]
}

interface AuthState {
  user: AuthUser | null
  perms: Set<string>
  loading: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean; mfaToken?: string }>
  loginWithMFA: (mfaToken: string, code: string) => Promise<void>
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    const token = tokenStorage.getAccess()
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    const { data, error } = await api.GET("/api/v1/auth/me" as any)
    if (error || !data) {
      setUser(null)
      tokenStorage.clear()
    } else {
      setUser(data as AuthUser)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refreshMe()
  }, [refreshMe])

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await api.POST("/api/v1/auth/login" as any, {
      body: { email, password },
    })
    if (error) throw new Error("Invalid credentials")
    const body = data as { access_token: string; refresh_token: string; mfa_required?: boolean; mfa_token?: string }
    if (body.mfa_required) {
      return { mfaRequired: true, mfaToken: body.mfa_token }
    }
    tokenStorage.set(body.access_token, body.refresh_token)
    await refreshMe()
    return { mfaRequired: false }
  }, [refreshMe])

  const loginWithMFA = useCallback(async (mfaToken: string, code: string) => {
    const { data, error } = await api.POST("/api/v1/auth/login/mfa" as any, {
      body: { mfa_token: mfaToken, code },
    })
    if (error) throw new Error("Invalid MFA code")
    const body = data as { access_token: string; refresh_token: string }
    tokenStorage.set(body.access_token, body.refresh_token)
    await refreshMe()
  }, [refreshMe])

  const logout = useCallback(async () => {
    const refresh = tokenStorage.getRefresh()
    if (refresh) {
      await api.POST("/api/v1/auth/logout" as any, { body: { refresh_token: refresh } })
    }
    tokenStorage.clear()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    perms: new Set(user?.permissions || []),
    loading,
    login,
    loginWithMFA,
    logout,
    refreshMe,
  }), [user, loading, login, loginWithMFA, logout, refreshMe])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
```

- [ ] **Step 3: Create `apps/web/src/lib/perm.ts`**

```typescript
import { useAuth } from "./auth"

export function useCan(perm: string | string[]): boolean {
  const { perms } = useAuth()
  const required = Array.isArray(perm) ? perm : [perm]
  return required.every((p) => perms.has(p))
}
```

- [ ] **Step 4: Create LoginForm + LoginPage**

`apps/web/src/modules/auth/components/LoginForm.tsx`:

```tsx
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { useAuth } from "@/lib/auth"

export function LoginForm() {
  const { login, loginWithMFA } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [mfaState, setMfaState] = useState<{ token: string } | null>(null)
  const [mfaCode, setMfaCode] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mfaState) {
        await loginWithMFA(mfaState.token, mfaCode)
        navigate("/")
        return
      }
      const result = await login(email, password)
      if (result.mfaRequired && result.mfaToken) {
        setMfaState({ token: result.mfaToken })
      } else {
        navigate("/")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-2">HRMS — Sign in</h1>
      {!mfaState ? (
        <>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="Email"
            className="w-full border rounded px-3 py-2"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-label="Password"
            className="w-full border rounded px-3 py-2"
          />
        </>
      ) : (
        <input
          type="text"
          placeholder="6-digit code"
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value)}
          required
          aria-label="MFA code"
          inputMode="numeric"
          autoFocus
          className="w-full border rounded px-3 py-2"
        />
      )}
      {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-slate-900 text-white py-2 rounded disabled:opacity-50"
      >
        {submitting ? "..." : mfaState ? "Verify" : "Sign in"}
      </button>
    </form>
  )
}
```

`apps/web/src/modules/auth/pages/LoginPage.tsx`:

```tsx
import { LoginForm } from "../components/LoginForm"

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <LoginForm />
    </main>
  )
}
```

`apps/web/src/modules/auth/routes.tsx`:

```tsx
import { lazy } from "react"
import type { RouteObject } from "react-router-dom"

const LoginPage = lazy(() => import("./pages/LoginPage"))

export const authRoutes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
]
```

- [ ] **Step 5: Write LoginForm test**

Create `apps/web/src/modules/auth/components/LoginForm.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { AuthProvider } from "@/lib/auth"

import { LoginForm } from "./LoginForm"

describe("LoginForm", () => {
  it("renders email + password fields", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginForm />
        </AuthProvider>
      </MemoryRouter>
    )
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument()
  })

  it("shows error on failed login", async () => {
    const user = userEvent.setup()
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Invalid" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    )

    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginForm />
        </AuthProvider>
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/email/i), "x@example.com")
    await user.type(screen.getByLabelText(/password/i), "bad")
    await user.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 6: Run tests, expect PASS**

```
cd apps/web && pnpm test 2>&1 | tail -15; cd ../..
```

- [ ] **Step 7: Commit Task 2**

```
git add apps/web/ pnpm-lock.yaml
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): AuthContext + login form with MFA challenge step"
```

---

## Task 3: RouteGuard + SignedOutGate + AppShell + HomePage

**Files:**
- Create: `apps/web/src/components/RouteGuard.tsx`
- Create: `apps/web/src/components/SignedOutGate.tsx`
- Create: `apps/web/src/components/shell/AppShell.tsx`
- Create: `apps/web/src/components/shell/TopBar.tsx`
- Create: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: SignedOutGate**

`apps/web/src/components/SignedOutGate.tsx`:

```tsx
import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"

import { useAuth } from "@/lib/auth"

export function SignedOutGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}
```

- [ ] **Step 2: RouteGuard**

`apps/web/src/components/RouteGuard.tsx`:

```tsx
import type { ReactNode } from "react"

import { useCan } from "@/lib/perm"

export function RouteGuard({ perms, children }: { perms: string[]; children: ReactNode }) {
  const allowed = useCan(perms)
  if (!allowed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>You don't have permission to view this page.</p>
      </main>
    )
  }
  return <>{children}</>
}
```

- [ ] **Step 3: AppShell + TopBar**

`apps/web/src/components/shell/TopBar.tsx`:

```tsx
import { useNavigate } from "react-router-dom"

import { useAuth } from "@/lib/auth"

export function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="border-b bg-white">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="font-semibold">HRMS</div>
        <div className="flex items-center gap-3 text-sm">
          <span aria-label="user-email">{user?.email}</span>
          <button
            type="button"
            onClick={async () => {
              await logout()
              navigate("/login")
            }}
            className="text-slate-600 hover:text-slate-900"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  )
}
```

`apps/web/src/components/shell/AppShell.tsx`:

```tsx
import { Outlet } from "react-router-dom"

import { SignedOutGate } from "../SignedOutGate"

import { TopBar } from "./TopBar"

export function AppShell() {
  return (
    <SignedOutGate>
      <div className="min-h-screen flex flex-col">
        <TopBar />
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
    </SignedOutGate>
  )
}
```

- [ ] **Step 4: HomePage**

`apps/web/src/pages/HomePage.tsx`:

```tsx
import { useAuth } from "@/lib/auth"

export default function HomePage() {
  const { user, perms } = useAuth()

  return (
    <div className="space-y-3 max-w-3xl">
      <h1 className="text-2xl font-bold">Welcome, {user?.email}</h1>
      <p className="text-slate-600">Org: {user?.org_id}</p>
      <section>
        <h2 className="font-semibold mt-4 mb-2">Your permissions</h2>
        {perms.size === 0 ? (
          <p className="text-slate-500">No permissions assigned yet.</p>
        ) : (
          <ul className="text-sm font-mono">
            {[...perms].sort().map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 5: App.tsx — compose providers + routes**

Replace `apps/web/src/App.tsx`:

```tsx
import { lazy, Suspense } from "react"
import { createBrowserRouter, RouterProvider } from "react-router-dom"

import { AppShell } from "./components/shell/AppShell"
import { AuthProvider } from "./lib/auth"
import { authRoutes } from "./modules/auth/routes"

const HomePage = lazy(() => import("./pages/HomePage"))

const router = createBrowserRouter([
  ...authRoutes,
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Suspense fallback={null}><HomePage /></Suspense> },
    ],
  },
])

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
```

- [ ] **Step 6: Update main.tsx if needed**

`apps/web/src/main.tsx` should remain unchanged — `AuthProvider` is now wrapping `RouterProvider` inside `App`.

- [ ] **Step 7: Run all tests + build**

```
cd apps/web && pnpm test && pnpm build && cd ../..
```
Expected: tests green, vite build clean.

- [ ] **Step 8: Manual smoke (against the running dev compose)**

```
sg docker -c 'docker compose -f deploy/docker-compose.yml up -d' 2>&1 | tail -3
sleep 30
sg docker -c 'docker compose -f deploy/docker-compose.yml exec -T api uv run python manage.py shell -c "
import uuid
from modules.identity.models import User
from modules.organization.models import Organization
from django.core.management import call_command
org = Organization.objects.create(name=\"Provintell\", slug=\"provintell\", country_code=\"MY\", default_currency=\"MYR\", default_timezone=\"Asia/Kuala_Lumpur\", default_locale=\"en-MY\")
u = User.objects.create_user(email=\"admin@provintell.local\", password=\"Demo!2026\", org_id=org.id, is_staff=True)
call_command(\"seed_permission_catalogue\")
call_command(\"seed_default_roles\", \"--org-id\", str(org.id))
from modules.identity.models import Role, UserRole
admin_role = Role.objects.get(org_id=org.id, code=\"org_admin\")
UserRole.objects.create(user=u, role=admin_role, granted_by=None)
print(\"Created admin@provintell.local / Demo!2026 with org_admin role\")
"' 2>&1 | tail -5
```

Then in a browser: open http://localhost:5173/login, sign in with `admin@provintell.local` / `Demo!2026`. You should land on `/` showing the user's email + the full org_admin permission list.

- [ ] **Step 9: Commit Task 3**

```
git add apps/web/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): AppShell, RouteGuard, SignedOutGate, HomePage with permissions list"
```

---

## Task 4: M1 milestone close — CHANGELOG + tag v0.1.0-m1

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update CHANGELOG.md**

```markdown
## [Unreleased]

## [0.1.0-m1] - 2026-04-28

### Added
- **M1a — Foundations:** `BaseModel`, `TenantBaseModel`, `EncryptedCharField`, `Money` helpers, RFC 7807 exception handler, `Organization` model + Malaysia country/holidays/leave-type-defaults seed, `Department` tree.
- **M1b-1 — Identity:** Custom `User` model (org-scoped email uniqueness, MFA-ready fields, JSONB preferences/consents), Permission catalogue, Role bundles, UserRole, seed commands for the M1b permission scope and 7 default system roles (`org_admin`, `hr_manager`, `finance`, `manager`, `team_lead`, `employee`, `auditor`).
- **M1b-2 — Auth:** `/api/v1/auth/{login,refresh,logout,me,password/forgot,password/reset,mfa/enable,mfa/confirm,mfa,login/mfa}`. JWT (simplejwt) with refresh-token rotation. TOTP MFA via `pyotp`. Session table tracks issued tokens for server-side revocation.
- **M1b-3 — RBAC:** `HRMSPermission` DRF class, `TenantContextMiddleware`, `OrgService`, Redis-backed permission-set cache with signal invalidation. Organization + Department viewsets are now RBAC-gated.
- **M1b-4 — Audit:** `audit_log` (Tier-1) and `payroll_audit_ledger` (chained, append-only via Postgres trigger) tables. `AuditContextMiddleware` captures actor/ip/ua. Helper API: `from common.audit import append, append_payroll, verify_payroll_chain`. `/api/v1/org/settings` GET/PATCH endpoints.
- **M1c — Frontend Auth:** typed `openapi-fetch` API client with token storage and 401 refresh-retry; `AuthContext` + `useAuth` + `useCan`; login form with MFA challenge step; `<SignedOutGate>` + `<RouteGuard>`; AppShell with TopBar (logout); HomePage showing the signed-in user's email + permission codes.
```

- [ ] **Step 2: Commit + tag**

```
git add CHANGELOG.md
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "chore: M1 milestone complete — release 0.1.0-m1"
git tag -a v0.1.0-m1 -m "M1: Identity, Org, RBAC, Audit — backend + frontend auth complete"
```

---

## M1c Acceptance Criteria

- [ ] User navigates to `/login`, signs in with email + password, lands on `/` and sees their email + permission codes
- [ ] If MFA is enabled, the second step prompts for a 6-digit code and completes with a valid TOTP
- [ ] Logout clears tokens and returns to `/login`
- [ ] Refresh-token silent renewal: a 401 from any non-auth endpoint triggers a refresh + retry
- [ ] `useCan(perm)` hook returns true when the user holds the perm, false otherwise
- [ ] `<RouteGuard perms={[...]}>` blocks unprivileged users from a route's content
- [ ] `pnpm test` green; `pnpm build` clean; bundle gz < 250 KB
- [ ] Pre-commit clean
- [ ] Tag `v0.1.0-m1` exists

That closes M1.
