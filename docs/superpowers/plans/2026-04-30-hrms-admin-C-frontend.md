# HRMS Admin Tools — Sub-plan C: Frontend admin pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Spec:** `docs/superpowers/specs/2026-04-30-hrms-admin-tools.md`
**Roadmap:** `docs/superpowers/plans/2026-04-30-hrms-admin-tools-roadmap.md`
**Prereq:** Sub-plans A + B merged.

**Goal:** Three admin pages live, RolesCard embedded on EmployeeDetail, FeaturesProvider gates sidebar + ⌘K. After C: feature is fully usable end-to-end via UI; frontend test count rises ~92 → ~108.

**Architecture:**
- New module folder `apps/web/src/modules/admin/` with `api.ts`, `pages/`, `components/`.
- Three lazy-loaded routes wired into `App.tsx` via a new `adminRoutes` export.
- A new `FeaturesProvider` (in `apps/web/src/lib/feature-flags.tsx`) wraps `<App>` inside `AuthProvider` and exposes `useFeature(key)`. It fetches `/api/v1/org/feature-flags/` on login, caches in-memory until logout.
- `Sidebar` and `CommandPalette` read both `useCan(perm)` AND `useFeature(moduleKey)` to decide visibility.

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + react-router-dom v6 + openapi-fetch + vitest + Testing Library.

---

## Task 1: Typed admin API client

**Files:**
- Create: `apps/web/src/modules/admin/api.ts`
- Create: `apps/web/src/modules/admin/api.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/modules/admin/api.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { roleApi, userRolesApi, featureFlagApi } from "./api";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    GET: vi.fn(),
    PATCH: vi.fn(),
    POST: vi.fn(),
  },
}));

const mockedApi = api as unknown as {
  GET: ReturnType<typeof vi.fn>;
  PATCH: ReturnType<typeof vi.fn>;
  POST: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("roleApi", () => {
  it("list returns array of roles", async () => {
    mockedApi.GET.mockResolvedValueOnce({
      data: [{ code: "org_admin", name: "Org Admin", is_system: true, permissions: [], member_count: 1 }],
      error: undefined,
    });
    const result = await roleApi.list();
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("org_admin");
  });

  it("retrieve fetches single role with permissions", async () => {
    mockedApi.GET.mockResolvedValueOnce({
      data: { code: "manager", name: "Manager", is_system: true, permissions: ["leave:approve:team"], member_count: 3 },
      error: undefined,
    });
    const r = await roleApi.retrieve("manager");
    expect(r.permissions).toEqual(["leave:approve:team"]);
  });

  it("setPermissions PATCHes and returns updated role", async () => {
    mockedApi.PATCH.mockResolvedValueOnce({
      data: { code: "team_lead", name: "Team Lead", is_system: true, permissions: ["leave:approve:team", "claim:approve:team"], member_count: 2 },
      error: undefined,
    });
    const r = await roleApi.setPermissions("team_lead", ["leave:approve:team", "claim:approve:team"]);
    expect(r.permissions).toContain("claim:approve:team");
  });

  it("reset POSTs to defaults endpoint", async () => {
    mockedApi.POST.mockResolvedValueOnce({
      data: { code: "team_lead", name: "Team Lead", is_system: true, permissions: [], member_count: 2 },
      error: undefined,
    });
    await roleApi.reset("team_lead");
    expect(mockedApi.POST).toHaveBeenCalled();
  });
});

describe("userRolesApi", () => {
  it("assign sends PATCH with role_codes", async () => {
    mockedApi.PATCH.mockResolvedValueOnce({
      data: { id: "u-1", roles: ["manager"] },
      error: undefined,
    });
    const r = await userRolesApi.assign("u-1", ["manager"]);
    expect(r.roles).toEqual(["manager"]);
  });
});

describe("featureFlagApi", () => {
  it("list returns flag map", async () => {
    mockedApi.GET.mockResolvedValueOnce({
      data: [
        { key: "leave", enabled: true, is_critical: false, depends_on: [] },
        { key: "claims", enabled: false, is_critical: false, depends_on: [] },
      ],
      error: undefined,
    });
    const result = await featureFlagApi.list();
    expect(result).toHaveLength(2);
    expect(result[1].enabled).toBe(false);
  });

  it("setEnabled PATCHes single flag", async () => {
    mockedApi.PATCH.mockResolvedValueOnce({
      data: { key: "claims", enabled: false, is_critical: false, depends_on: [] },
      error: undefined,
    });
    const r = await featureFlagApi.setEnabled("claims", false);
    expect(r.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

Run: `cd apps/web && pnpm vitest run src/modules/admin/api.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement client**

Create `apps/web/src/modules/admin/api.ts`:

```typescript
import { api } from "@/lib/api";

export interface RoleSummary {
  code: string;
  name: string;
  description?: string;
  is_system: boolean;
  member_count: number;
}

export interface RoleDetail extends RoleSummary {
  permissions: string[];
}

export interface UserRolesResponse {
  id: string;
  roles: string[];
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  is_critical: boolean;
  depends_on: string[];
}

export const roleApi = {
  list: async (): Promise<RoleSummary[]> => {
    const { data, error } = (await api.GET("/api/v1/org/roles/" as never)) as {
      data?: RoleSummary[];
      error?: unknown;
    };
    if (error) throw new Error("Could not load roles");
    return data ?? [];
  },
  retrieve: async (code: string): Promise<RoleDetail> => {
    const { data, error } = (await api.GET("/api/v1/org/roles/{code}/" as never, {
      params: { path: { code } },
    } as never)) as { data?: RoleDetail; error?: unknown };
    if (error || !data) throw new Error("Could not load role");
    return data;
  },
  setPermissions: async (code: string, permissions: string[]): Promise<RoleDetail> => {
    const { data, error } = (await api.PATCH("/api/v1/org/roles/{code}/permissions/" as never, {
      params: { path: { code } },
      body: { permissions },
    } as never)) as { data?: RoleDetail; error?: unknown };
    if (error || !data) throw new Error("Could not save permissions");
    return data;
  },
  reset: async (code: string): Promise<RoleDetail> => {
    const { data, error } = (await api.POST("/api/v1/org/roles/{code}/reset/" as never, {
      params: { path: { code } },
    } as never)) as { data?: RoleDetail; error?: unknown };
    if (error || !data) throw new Error("Could not reset role");
    return data;
  },
};

export const userRolesApi = {
  assign: async (userId: string, roleCodes: string[]): Promise<UserRolesResponse> => {
    const { data, error } = (await api.PATCH("/api/v1/users/{id}/roles/" as never, {
      params: { path: { id: userId } },
      body: { role_codes: roleCodes },
    } as never)) as { data?: UserRolesResponse; error?: unknown };
    if (error || !data) throw new Error("Could not assign roles");
    return data;
  },
};

export const featureFlagApi = {
  list: async (): Promise<FeatureFlag[]> => {
    const { data, error } = (await api.GET("/api/v1/org/feature-flags/" as never)) as {
      data?: FeatureFlag[];
      error?: unknown;
    };
    if (error) throw new Error("Could not load feature flags");
    return data ?? [];
  },
  setEnabled: async (key: string, enabled: boolean): Promise<FeatureFlag> => {
    const { data, error } = (await api.PATCH("/api/v1/org/feature-flags/{key}/" as never, {
      params: { path: { key } },
      body: { enabled },
    } as never)) as { data?: FeatureFlag; error?: unknown };
    if (error || !data) throw new Error("Could not update feature flag");
    return data;
  },
};
```

> Note on `as never` casts: the `paths` types in `@hrms/contracts/generated` are regenerated from OpenAPI after Sub-plans A & B ship. Until that regeneration runs in CI we cast through `never` — same pattern used by `employeeApi.getReportingChain` (raw fetch fallback). After regen, swap the casts for the real path keys in a follow-up.

- [ ] **Step 4: Run tests**

Run: `cd apps/web && pnpm vitest run src/modules/admin/api.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/admin/api.ts apps/web/src/modules/admin/api.test.ts
git commit -m "feat(admin): typed clients for roles, user roles, feature flags"
```

---

## Task 2: FeaturesProvider + useFeature hook

**Files:**
- Create: `apps/web/src/lib/feature-flags.tsx`
- Create: `apps/web/src/lib/feature-flags.test.tsx`
- Modify: `apps/web/src/App.tsx` (wrap children inside AuthProvider with FeaturesProvider)

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/lib/feature-flags.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FeaturesProvider, useFeature } from "./feature-flags";
import { featureFlagApi } from "@/modules/admin/api";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "u-1" }, perms: new Set<string>() }),
}));

vi.mock("@/modules/admin/api", () => ({
  featureFlagApi: { list: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function Probe({ key }: { key: string }) {
  const enabled = useFeature(key);
  return <div data-testid="probe">{enabled ? "on" : "off"}</div>;
}

describe("FeaturesProvider", () => {
  it("returns true while loading (optimistic)", async () => {
    (featureFlagApi.list as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}), // never resolves
    );
    render(
      <FeaturesProvider>
        <Probe key_="leave" />
      </FeaturesProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("on");
  });

  it("reflects fetched state", async () => {
    (featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { key: "leave", enabled: true, is_critical: false, depends_on: [] },
      { key: "claims", enabled: false, is_critical: false, depends_on: [] },
    ]);
    render(
      <FeaturesProvider>
        <Probe key_="claims" />
      </FeaturesProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("off");
    });
  });

  it("treats unknown keys as enabled (optimistic)", async () => {
    (featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    render(
      <FeaturesProvider>
        <Probe key_="totally-new" />
      </FeaturesProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("on");
    });
  });
});
```

> Note: `Probe` uses prop name `key_` (with trailing underscore) because `key` is a reserved React prop. Update the `Probe` signature accordingly when you write the test:
>
> ```tsx
> function Probe({ key_ }: { key_: string }) {
>   return <div data-testid="probe">{useFeature(key_) ? "on" : "off"}</div>;
> }
> ```
> The `<Probe key="leave" />` calls above should be `<Probe key_="leave" />` — use `key_` everywhere.

- [ ] **Step 2: Run tests, expect fail**

Run: `cd apps/web && pnpm vitest run src/lib/feature-flags.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement provider**

Create `apps/web/src/lib/feature-flags.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { featureFlagApi } from "@/modules/admin/api";
import { useAuth } from "./auth";

interface FeaturesContextValue {
  /** Map of key → enabled. Missing keys are treated as enabled (optimistic). */
  flags: Record<string, boolean>;
  loaded: boolean;
  refresh: () => Promise<void>;
}

const FeaturesContext = createContext<FeaturesContextValue | null>(null);

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  const refresh = useMemo(
    () => async () => {
      try {
        const list = await featureFlagApi.list();
        const next: Record<string, boolean> = {};
        for (const f of list) next[f.key] = f.enabled;
        setFlags(next);
      } catch {
        // Optimistic: treat as all-enabled on error.
        setFlags({});
      } finally {
        setLoaded(true);
      }
    },
    [],
  );

  useEffect(() => {
    if (!user) {
      setFlags({});
      setLoaded(false);
      return;
    }
    void refresh();
  }, [user, refresh]);

  return (
    <FeaturesContext.Provider value={{ flags, loaded, refresh }}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeature(key: string): boolean {
  const ctx = useContext(FeaturesContext);
  if (!ctx) return true; // default-on if used outside provider
  if (!ctx.loaded) return true; // optimistic during initial fetch
  // Missing key is treated as enabled: prevents new modules disappearing
  // from the UI before backend list catches up.
  return ctx.flags[key] !== false;
}

export function useFeaturesRefresh(): () => Promise<void> {
  const ctx = useContext(FeaturesContext);
  if (!ctx) throw new Error("useFeaturesRefresh outside FeaturesProvider");
  return ctx.refresh;
}
```

- [ ] **Step 4: Wire provider into App.tsx**

Modify `apps/web/src/App.tsx`:

Replace the `App` function body with:

```tsx
import { FeaturesProvider } from "./lib/feature-flags";

// ...existing imports...

export function App() {
  return (
    <AuthProvider>
      <FeaturesProvider>
        <RouterProvider router={router} />
        <Toaster />
      </FeaturesProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/web && pnpm vitest run src/lib/feature-flags.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/feature-flags.tsx apps/web/src/lib/feature-flags.test.tsx apps/web/src/App.tsx
git commit -m "feat(admin): FeaturesProvider + useFeature hook"
```

---

## Task 3: AdminRolesPage — list 7 roles

**Files:**
- Create: `apps/web/src/modules/admin/pages/AdminRolesPage.tsx`
- Create: `apps/web/src/modules/admin/pages/AdminRolesPage.test.tsx`
- Create: `apps/web/src/modules/admin/routes.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/modules/admin/pages/AdminRolesPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminRolesPage from "./AdminRolesPage";
import { roleApi } from "../api";

vi.mock("../api", () => ({
  roleApi: { list: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminRolesPage />
    </MemoryRouter>,
  );

describe("AdminRolesPage", () => {
  it("renders the 7 roles", async () => {
    (roleApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { code: "org_admin", name: "Org Admin", is_system: true, member_count: 1 },
      { code: "hr_manager", name: "HR Manager", is_system: true, member_count: 1 },
      { code: "finance", name: "Finance", is_system: true, member_count: 1 },
      { code: "manager", name: "Manager", is_system: true, member_count: 3 },
      { code: "team_lead", name: "Team Lead", is_system: true, member_count: 2 },
      { code: "employee", name: "Employee", is_system: true, member_count: 12 },
      { code: "auditor", name: "Auditor", is_system: true, member_count: 0 },
    ]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Org Admin")).toBeInTheDocument();
      expect(screen.getByText("Auditor")).toBeInTheDocument();
    });
  });

  it("shows member counts", async () => {
    (roleApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { code: "manager", name: "Manager", is_system: true, member_count: 3 },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

Run: `cd apps/web && pnpm vitest run src/modules/admin/pages/AdminRolesPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement page**

Create `apps/web/src/modules/admin/pages/AdminRolesPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { PageHeader } from "@/components/shell/PageHeader";
import { DataTable } from "@/components/hrms/DataTable";
import { type RoleSummary, roleApi } from "../api";

export default function AdminRolesPage() {
  const [rows, setRows] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    roleApi
      .list()
      .then((rs) => setRows(rs))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roles"
        description="Manage permissions for each role. 7 system roles."
      />
      {err && <div className="text-error text-small">{err}</div>}
      <DataTable
        loading={loading}
        rows={rows}
        getRowKey={(r) => r.code}
        columns={[
          {
            header: "Name",
            cell: (r) => (
              <Link
                to={`/admin/roles/${r.code}`}
                className="text-accent-300 hover:underline"
              >
                {r.name}
              </Link>
            ),
          },
          { header: "Code", cell: (r) => <code className="text-text-tertiary">{r.code}</code> },
          {
            header: "Members",
            cell: (r) => <span>{r.member_count}</span>,
          },
        ]}
        emptyMessage="No roles defined."
      />
    </div>
  );
}
```

> If the existing `DataTable` API differs (check `apps/web/src/components/hrms/DataTable.tsx`), adapt the prop names. The signatures `getRowKey`, `columns`, `rows`, `loading`, `emptyMessage` are based on the v1.2.0 codebase pattern; if they've changed, follow the current convention.

- [ ] **Step 4: Create routes file**

Create `apps/web/src/modules/admin/routes.tsx`:

```tsx
import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const AdminRolesPage = lazy(() => import("./pages/AdminRolesPage"));
const AdminRoleDetailPage = lazy(() => import("./pages/AdminRoleDetailPage"));
const AdminModulesPage = lazy(() => import("./pages/AdminModulesPage"));

export const adminRoutes: RouteObject[] = [
  { path: "/admin/roles", element: <AdminRolesPage /> },
  { path: "/admin/roles/:code", element: <AdminRoleDetailPage /> },
  { path: "/admin/modules", element: <AdminModulesPage /> },
];
```

(`AdminRoleDetailPage` and `AdminModulesPage` are placeholders — they'll be created in Task 4 and Task 7. Tests for this routes file aren't needed.)

- [ ] **Step 5: Wire routes into App.tsx**

Modify `apps/web/src/App.tsx`:

Add import next to other module routes:

```tsx
import { adminRoutes } from "./modules/admin/routes";
```

In the `children` array of the `/` route, add:

```tsx
...adminRoutes.map((r) => ({
  ...r,
  path: r.path?.replace(/^\//, ""),
  element: <Suspense fallback={null}>{r.element}</Suspense>,
})),
```

- [ ] **Step 6: Stub the not-yet-built pages**

To keep the build green until tasks 4 and 7, create two stubs:

`apps/web/src/modules/admin/pages/AdminRoleDetailPage.tsx`:
```tsx
export default function AdminRoleDetailPage() {
  return <div>Loading…</div>;
}
```

`apps/web/src/modules/admin/pages/AdminModulesPage.tsx`:
```tsx
export default function AdminModulesPage() {
  return <div>Loading…</div>;
}
```

These will be replaced.

- [ ] **Step 7: Run tests + build**

Run:
```bash
cd apps/web && pnpm vitest run src/modules/admin/pages/AdminRolesPage.test.tsx
cd apps/web && pnpm typecheck
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/modules/admin/ apps/web/src/App.tsx
git commit -m "feat(admin): AdminRolesPage + admin routes"
```

---

## Task 4: AdminRoleDetailPage — permission matrix + reset

**Files:**
- Modify (replace stub): `apps/web/src/modules/admin/pages/AdminRoleDetailPage.tsx`
- Create: `apps/web/src/modules/admin/pages/AdminRoleDetailPage.test.tsx`
- Create: `apps/web/src/modules/admin/lib/permission-catalogue.ts` (groups perms by module)

- [ ] **Step 1: Build the permission catalogue helper**

Create `apps/web/src/modules/admin/lib/permission-catalogue.ts`:

```typescript
/**
 * Group permission codes by module label for the matrix UI.
 * We hard-code the grouping rather than fetching it because the catalogue
 * is small (~70 codes) and the labels are display-only.
 */
export interface PermissionGroup {
  module: string;
  perms: { code: string; label: string }[];
}

const GROUPS: Record<string, { match: (code: string) => boolean; label: (code: string) => string }> = {
  Identity: {
    match: (c) => c.startsWith("user:") || c.startsWith("role:") || c.startsWith("audit:"),
    label: (c) => c,
  },
  Employee: {
    match: (c) => c.startsWith("employee:") || c.startsWith("department:"),
    label: (c) => c,
  },
  Leave: {
    match: (c) => c.startsWith("leave:"),
    label: (c) => c,
  },
  Schedule: {
    match: (c) => c.startsWith("schedule:") || c.startsWith("attendance:"),
    label: (c) => c,
  },
  Claims: {
    match: (c) => c.startsWith("claim:"),
    label: (c) => c,
  },
  Payroll: {
    match: (c) => c.startsWith("payroll:") || c.startsWith("payslip:"),
    label: (c) => c,
  },
  KPI: {
    match: (c) => c.startsWith("kpi:"),
    label: (c) => c,
  },
  Certification: {
    match: (c) => c.startsWith("cert:"),
    label: (c) => c,
  },
  Training: {
    match: (c) => c.startsWith("training:"),
    label: (c) => c,
  },
  Reports: {
    match: (c) => c.startsWith("report:"),
    label: (c) => c,
  },
  Notifications: {
    match: (c) => c.startsWith("notif:") || c.startsWith("approvals:"),
    label: (c) => c,
  },
  Org: {
    match: (c) => c.startsWith("org:"),
    label: (c) => c,
  },
};

const MODULE_ORDER = [
  "Identity",
  "Employee",
  "Org",
  "Leave",
  "Schedule",
  "Claims",
  "Payroll",
  "KPI",
  "Certification",
  "Training",
  "Reports",
  "Notifications",
];

export function groupPermissions(allCodes: string[]): PermissionGroup[] {
  const buckets: Record<string, { code: string; label: string }[]> = {};
  const others: { code: string; label: string }[] = [];

  for (const code of allCodes) {
    let placed = false;
    for (const [moduleName, def] of Object.entries(GROUPS)) {
      if (def.match(code)) {
        if (!buckets[moduleName]) buckets[moduleName] = [];
        buckets[moduleName].push({ code, label: def.label(code) });
        placed = true;
        break;
      }
    }
    if (!placed) others.push({ code, label: code });
  }

  const result: PermissionGroup[] = [];
  for (const m of MODULE_ORDER) {
    if (buckets[m]) {
      buckets[m].sort((a, b) => a.code.localeCompare(b.code));
      result.push({ module: m, perms: buckets[m] });
    }
  }
  if (others.length) {
    others.sort((a, b) => a.code.localeCompare(b.code));
    result.push({ module: "Other", perms: others });
  }
  return result;
}
```

- [ ] **Step 2: Write failing test for the page**

Create `apps/web/src/modules/admin/pages/AdminRoleDetailPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminRoleDetailPage from "./AdminRoleDetailPage";
import { roleApi } from "../api";

vi.mock("../api", () => ({
  roleApi: {
    retrieve: vi.fn(),
    setPermissions: vi.fn(),
    reset: vi.fn(),
  },
}));

// Stub catalogue list — page fetches all known perms via roleApi indirectly,
// but here we just rely on the role's own permissions for grouping.

beforeEach(() => {
  vi.clearAllMocks();
});

const renderAt = (code: string) =>
  render(
    <MemoryRouter initialEntries={[`/admin/roles/${code}`]}>
      <Routes>
        <Route path="/admin/roles/:code" element={<AdminRoleDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("AdminRoleDetailPage", () => {
  it("renders role name and permission rows grouped by module", async () => {
    (roleApi.retrieve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: "team_lead",
      name: "Team Lead",
      is_system: true,
      member_count: 2,
      permissions: ["leave:approve:team", "claim:approve:team"],
    });
    renderAt("team_lead");
    await waitFor(() => screen.getByText("Team Lead"));
    expect(screen.getByText("Leave")).toBeInTheDocument();
    expect(screen.getByText("Claims")).toBeInTheDocument();
  });

  it("toggles a permission and shows save bar", async () => {
    (roleApi.retrieve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: "team_lead",
      name: "Team Lead",
      is_system: true,
      member_count: 2,
      permissions: ["leave:approve:team"],
    });
    renderAt("team_lead");
    await waitFor(() => screen.getByText("Team Lead"));

    const checkbox = screen.getByRole("checkbox", { name: /leave:approve:team/ });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);

    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it("reset requires a second confirmation click", async () => {
    (roleApi.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: "team_lead",
      name: "Team Lead",
      is_system: true,
      member_count: 2,
      permissions: [],
    });
    (roleApi.reset as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: "team_lead",
      name: "Team Lead",
      is_system: true,
      member_count: 2,
      permissions: ["leave:approve:team"],
    });
    renderAt("team_lead");
    await waitFor(() => screen.getByText("Team Lead"));

    const resetBtn = screen.getByRole("button", { name: /reset to defaults/i });
    fireEvent.click(resetBtn);
    expect(roleApi.reset).not.toHaveBeenCalled();

    const confirmBtn = screen.getByRole("button", { name: /click again to confirm/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(roleApi.reset).toHaveBeenCalledWith("team_lead"));
  });
});
```

- [ ] **Step 3: Run tests, expect fail**

Run: `cd apps/web && pnpm vitest run src/modules/admin/pages/AdminRoleDetailPage.test.tsx`
Expected: FAIL — page is still the stub.

- [ ] **Step 4: Replace stub with real page**

Replace `apps/web/src/modules/admin/pages/AdminRoleDetailPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/shell/PageHeader";
import { type RoleDetail, roleApi } from "../api";
import { groupPermissions } from "../lib/permission-catalogue";

export default function AdminRoleDetailPage() {
  const { code } = useParams<{ code: string }>();
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [allKnownCodes, setAllKnownCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    roleApi
      .retrieve(code)
      .then((r) => {
        setRole(r);
        setDraft(new Set(r.permissions));
        // Use this role's permissions as the seed catalogue; other roles
        // contribute their codes through subsequent visits. This avoids
        // an extra network call.
        setAllKnownCodes((prev) => Array.from(new Set([...prev, ...r.permissions])));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [code]);

  const groups = useMemo(() => {
    // Render every code we know about so admin can ADD perms not currently held.
    // The full catalogue is fetched once below.
    return groupPermissions(allKnownCodes);
  }, [allKnownCodes]);

  // One-time catalogue fetch via a meta endpoint or by union of all roles.
  // Simplest: fetch all roles list once and union their `permissions`.
  // The list endpoint doesn't include permissions, so we hit retrieve for each.
  // For Phase 1 we accept lazy-loading: admin must visit each role detail
  // at least once to seed the union. This works because: (a) an admin who
  // wants to grant team_lead `claim:approve:team` will already know the perm
  // exists from manager's role page, and (b) backend rejects unknown codes.
  // A future improvement: dedicated GET /api/v1/org/permissions/ endpoint.

  if (loading) return <div>Loading…</div>;
  if (err) return <div className="text-error">{err}</div>;
  if (!role) return <div>Not found.</div>;

  const dirty =
    draft.size !== role.permissions.length ||
    role.permissions.some((p) => !draft.has(p));

  const toggle = (perm: string) => {
    const next = new Set(draft);
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    setDraft(next);
  };

  const save = async () => {
    if (!code) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await roleApi.setPermissions(code, Array.from(draft));
      setRole(updated);
      setDraft(new Set(updated.permissions));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(new Set(role.permissions));
  };

  const doReset = async () => {
    if (!code) return;
    if (!resetArmed) {
      setResetArmed(true);
      // Auto-disarm after 4s
      setTimeout(() => setResetArmed(false), 4000);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const updated = await roleApi.reset(code);
      setRole(updated);
      setDraft(new Set(updated.permissions));
      setResetArmed(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to reset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <PageHeader
        title={role.name}
        description={
          <span className="text-text-tertiary">
            <Link to="/admin/roles" className="hover:underline">
              ← Back to roles
            </Link>
            {"  ·  "}
            <code>{role.code}</code> · {role.member_count} member
            {role.member_count === 1 ? "" : "s"}
          </span>
        }
      />

      {err && <div className="text-error text-small">{err}</div>}

      <div className="flex justify-end">
        <Button
          variant={resetArmed ? "destructive" : "outline"}
          onClick={doReset}
          disabled={saving}
        >
          {resetArmed ? "Click again to confirm reset" : "Reset to defaults"}
        </Button>
      </div>

      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.module} className="bg-surface rounded-lg p-4">
            <h2 className="text-h2 font-semibold mb-3">{g.module}</h2>
            <ul className="space-y-2">
              {g.perms.map((p) => (
                <li key={p.code} className="flex items-center gap-3">
                  <Checkbox
                    id={`perm-${p.code}`}
                    checked={draft.has(p.code)}
                    onCheckedChange={() => toggle(p.code)}
                    aria-label={p.code}
                  />
                  <label
                    htmlFor={`perm-${p.code}`}
                    className="text-small font-mono text-text-secondary cursor-pointer"
                  >
                    {p.code}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border-subtle p-4 flex items-center justify-between shadow-lg">
          <span className="text-small text-text-secondary">
            {draft.size} permission{draft.size === 1 ? "" : "s"} selected · unsaved changes
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

> **Note on catalogue:** the page only shows codes the role currently has; to add perms the role doesn't have, the admin would need a full catalogue. **Decision:** add a second small fetch in `useEffect` that lists ALL 7 roles via `roleApi.list` and then `roleApi.retrieve` for each (sequential), unioning their `permissions`. That's 7 reads (cached after first visit). Add this loop after the initial load and update `allKnownCodes` cumulatively. Skip if the implementer decides this is overkill for the Phase 1 admin UI — note in commit message that a `GET /api/v1/org/permissions/` endpoint is the proper fix and add a TODO. Keep behavior optimistic: even if catalogue load fails, admin can still toggle the role's existing perms.

- [ ] **Step 5: Run tests**

Run: `cd apps/web && pnpm vitest run src/modules/admin/pages/AdminRoleDetailPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/admin/pages/AdminRoleDetailPage.tsx \
        apps/web/src/modules/admin/pages/AdminRoleDetailPage.test.tsx \
        apps/web/src/modules/admin/lib/permission-catalogue.ts
git commit -m "feat(admin): AdminRoleDetailPage with permission matrix + reset"
```

---

## Task 5: RolesCard component + EmployeeDetail integration

**Files:**
- Create: `apps/web/src/modules/admin/components/RolesCard.tsx`
- Create: `apps/web/src/modules/admin/components/RolesCard.test.tsx`
- Modify: `apps/web/src/modules/employee/pages/EmployeeDetailPage.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/modules/admin/components/RolesCard.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RolesCard } from "./RolesCard";
import { userRolesApi, roleApi } from "../api";

vi.mock("../api", () => ({
  userRolesApi: { assign: vi.fn() },
  roleApi: { list: vi.fn() },
}));

vi.mock("@/lib/perm", () => ({
  useCan: () => true,
}));

beforeEach(() => {
  vi.clearAllMocks();
  (roleApi.list as ReturnType<typeof vi.fn>).mockResolvedValue([
    { code: "manager", name: "Manager", is_system: true, member_count: 1 },
    { code: "team_lead", name: "Team Lead", is_system: true, member_count: 0 },
    { code: "employee", name: "Employee", is_system: true, member_count: 1 },
  ]);
});

describe("RolesCard", () => {
  it("renders the user's current role badges", () => {
    render(<RolesCard userId="u-1" currentRoles={["manager", "employee"]} />);
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Employee")).toBeInTheDocument();
  });

  it("opens edit dialog and assigns roles", async () => {
    (userRolesApi.assign as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "u-1",
      roles: ["manager", "team_lead", "employee"],
    });

    render(<RolesCard userId="u-1" currentRoles={["manager", "employee"]} />);
    fireEvent.click(screen.getByRole("button", { name: /edit roles/i }));
    await waitFor(() => screen.getByText(/team lead/i));
    fireEvent.click(screen.getByRole("checkbox", { name: /team lead/i }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(userRolesApi.assign).toHaveBeenCalledWith(
        "u-1",
        expect.arrayContaining(["manager", "employee", "team_lead"]),
      ),
    );
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

Run: `cd apps/web && pnpm vitest run src/modules/admin/components/RolesCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement component**

Create `apps/web/src/modules/admin/components/RolesCard.tsx`:

```tsx
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCan } from "@/lib/perm";
import { type RoleSummary, roleApi, userRolesApi } from "../api";

interface Props {
  userId: string;
  currentRoles: string[];
  /** Called after a successful save with the new role list. */
  onChange?: (roles: string[]) => void;
}

export function RolesCard({ userId, currentRoles, onChange }: Props) {
  const canEdit = useCan("role:write");
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set(currentRoles));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || roles.length > 0) return;
    roleApi.list().then(setRoles).catch(() => {
      // silent — dialog still works for current roles
    });
  }, [open, roles.length]);

  useEffect(() => {
    setDraft(new Set(currentRoles));
  }, [currentRoles]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const out = await userRolesApi.assign(userId, Array.from(draft));
      onChange?.(out.roles);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (code: string) => {
    const next = new Set(draft);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setDraft(next);
  };

  return (
    <section className="bg-surface rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-h2 font-semibold">Roles</h2>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Edit roles
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign roles</DialogTitle>
              </DialogHeader>
              <ul className="space-y-2 py-2">
                {roles.map((r) => (
                  <li key={r.code} className="flex items-center gap-3">
                    <Checkbox
                      id={`role-${r.code}`}
                      checked={draft.has(r.code)}
                      onCheckedChange={() => toggle(r.code)}
                      aria-label={r.name}
                    />
                    <label htmlFor={`role-${r.code}`} className="cursor-pointer">
                      {r.name}{" "}
                      <code className="text-text-tertiary text-small">{r.code}</code>
                    </label>
                  </li>
                ))}
              </ul>
              {err && <div className="text-error text-small">{err}</div>}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {currentRoles.length === 0 ? (
        <span className="text-text-tertiary text-small">No roles assigned.</span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {currentRoles.map((code) => {
            const role = roles.find((r) => r.code === code);
            return (
              <span
                key={code}
                className="inline-flex items-center rounded-full bg-canvas border border-border-subtle px-2.5 py-1 text-small"
              >
                {role?.name ?? code}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Wire into EmployeeDetailPage**

Read `apps/web/src/modules/employee/pages/EmployeeDetailPage.tsx`. Find a sensible spot — after the existing profile sections but before the reporting chain — to insert:

```tsx
import { RolesCard } from "@/modules/admin/components/RolesCard";
// ...
{employee.user_id && (
  <RolesCard
    userId={employee.user_id}
    currentRoles={employee.user_roles ?? []}
  />
)}
```

The Employee `retrieve` payload should already include `user_id` and `user_roles`; if it doesn't, add them to the backend serializer in Sub-plan A's `EmployeeSerializer` follow-up (or punt: render a placeholder card with "linked user not loaded — refresh"). The implementer should check the actual API response shape before assuming and adjust the read path.

- [ ] **Step 5: Run tests + typecheck**

Run:
```bash
cd apps/web && pnpm vitest run src/modules/admin/components/RolesCard.test.tsx
cd apps/web && pnpm typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/admin/components/ apps/web/src/modules/employee/pages/EmployeeDetailPage.tsx
git commit -m "feat(admin): RolesCard + EmployeeDetail integration"
```

---

## Task 6: AdminModulesPage — feature flag toggles

**Files:**
- Modify (replace stub): `apps/web/src/modules/admin/pages/AdminModulesPage.tsx`
- Create: `apps/web/src/modules/admin/pages/AdminModulesPage.test.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/modules/admin/pages/AdminModulesPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminModulesPage from "./AdminModulesPage";
import { featureFlagApi } from "../api";

vi.mock("../api", () => ({
  featureFlagApi: { list: vi.fn(), setEnabled: vi.fn() },
}));

vi.mock("@/lib/feature-flags", () => ({
  useFeaturesRefresh: () => vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminModulesPage />
    </MemoryRouter>,
  );

describe("AdminModulesPage", () => {
  it("renders togglable + critical + derived sections", async () => {
    (featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { key: "identity", enabled: true, is_critical: true, depends_on: [] },
      { key: "leave", enabled: true, is_critical: false, depends_on: [] },
      { key: "claims", enabled: false, is_critical: false, depends_on: [] },
    ]);
    renderPage();
    await waitFor(() => screen.getByText("Leave"));
    expect(screen.getByText(/required/i)).toBeInTheDocument();
  });

  it("toggling a module calls setEnabled and re-fetches", async () => {
    (featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { key: "leave", enabled: true, is_critical: false, depends_on: [] },
    ]);
    (featureFlagApi.setEnabled as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      key: "leave",
      enabled: false,
      is_critical: false,
      depends_on: [],
    });
    renderPage();
    await waitFor(() => screen.getByText("Leave"));

    const toggle = screen.getByRole("switch", { name: /leave/i });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(featureFlagApi.setEnabled).toHaveBeenCalledWith("leave", false),
    );
  });

  it("does not render a switch for critical modules", async () => {
    (featureFlagApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { key: "identity", enabled: true, is_critical: true, depends_on: [] },
    ]);
    renderPage();
    await waitFor(() => screen.getByText(/identity/i));
    expect(screen.queryByRole("switch", { name: /identity/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

Run: `cd apps/web && pnpm vitest run src/modules/admin/pages/AdminModulesPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Replace stub**

Replace `apps/web/src/modules/admin/pages/AdminModulesPage.tsx`:

```tsx
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Switch } from "@/components/ui/switch";
import { useFeaturesRefresh } from "@/lib/feature-flags";
import { type FeatureFlag, featureFlagApi } from "../api";

const LABELS: Record<string, string> = {
  identity: "Identity",
  employee: "Employees",
  organization: "Organisation",
  leave: "Leave",
  schedule: "Schedule",
  attendance: "Attendance",
  claims: "Claims",
  payslip: "Payslip",
  kpi: "KPI",
  cert: "Certifications",
  training: "Training",
  reports: "Reports",
  notifications: "Notifications",
  approvals: "Approvals",
  payroll: "Payroll",
};

export default function AdminModulesPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refreshGlobal = useFeaturesRefresh();

  const load = async () => {
    setLoading(true);
    try {
      const list = await featureFlagApi.list();
      setFlags(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onToggle = async (key: string, next: boolean) => {
    setBusyKey(key);
    setErr(null);
    try {
      await featureFlagApi.setEnabled(key, next);
      await load();
      await refreshGlobal();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusyKey(null);
    }
  };

  const labelFor = (k: string) => LABELS[k] ?? k;

  const critical = flags.filter((f) => f.is_critical);
  const derived = flags.filter(
    (f) => !f.is_critical && (f.depends_on?.length ?? 0) > 0,
  );
  const togglable = flags.filter(
    (f) => !f.is_critical && (f.depends_on?.length ?? 0) === 0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modules"
        description="Enable or disable system modules. Disabled modules disappear from the UI for everyone."
      />
      {err && <div className="text-error text-small">{err}</div>}
      {loading && <div className="text-text-tertiary">Loading…</div>}

      {togglable.length > 0 && (
        <section className="bg-surface rounded-lg p-4">
          <h2 className="text-h2 font-semibold mb-3">Modules</h2>
          <ul className="space-y-3">
            {togglable.map((f) => (
              <li key={f.key} className="flex items-center justify-between">
                <span>{labelFor(f.key)}</span>
                <Switch
                  aria-label={labelFor(f.key)}
                  checked={f.enabled}
                  disabled={busyKey === f.key}
                  onCheckedChange={(next) => onToggle(f.key, next)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {critical.length > 0 && (
        <section className="bg-surface rounded-lg p-4">
          <h2 className="text-h2 font-semibold mb-3">Required modules</h2>
          <ul className="space-y-2">
            {critical.map((f) => (
              <li key={f.key} className="flex items-center justify-between">
                <span>{labelFor(f.key)}</span>
                <span className="rounded-full bg-accent-500/20 text-accent-200 px-2 py-0.5 text-small">
                  Required
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {derived.length > 0 && (
        <section className="bg-surface rounded-lg p-4">
          <h2 className="text-h2 font-semibold mb-3">Derived modules</h2>
          <p className="text-text-tertiary text-small mb-3">
            These follow their parent module's state.
          </p>
          <ul className="space-y-2">
            {derived.map((f) => (
              <li key={f.key} className="flex items-center justify-between">
                <span>
                  {labelFor(f.key)}{" "}
                  <span className="text-text-tertiary text-small">
                    (depends on {f.depends_on.map(labelFor).join(", ")})
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-small ${
                    f.enabled
                      ? "bg-success/20 text-success-foreground"
                      : "bg-canvas text-text-tertiary"
                  }`}
                >
                  {f.enabled ? "On" : "Off"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests + typecheck**

Run:
```bash
cd apps/web && pnpm vitest run src/modules/admin/pages/AdminModulesPage.test.tsx
cd apps/web && pnpm typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/admin/pages/AdminModulesPage.tsx \
        apps/web/src/modules/admin/pages/AdminModulesPage.test.tsx
git commit -m "feat(admin): AdminModulesPage with feature flag toggles"
```

---

## Task 7: Sidebar + CommandPalette gating + Admin nav links

**Files:**
- Modify: `apps/web/src/components/shell/sidebar-nav.ts`
- Modify: `apps/web/src/components/shell/Sidebar.tsx`
- Modify: `apps/web/src/components/shell/CommandPalette.tsx`

- [ ] **Step 1: Add Roles + Modules to sidebar nav**

Modify `apps/web/src/components/shell/sidebar-nav.ts` — add to the Admin group (and update the icon import):

```ts
import { Settings, Shield } from "lucide-react";
// ... existing imports

// In the Admin group items array, add:
{
  label: "Roles",
  to: "/admin/roles",
  icon: Shield,
  perm: "role:read",
  // No `module` key — admin pages are never gated by feature flag.
},
{
  label: "Modules",
  to: "/admin/modules",
  icon: Settings,
  perm: "org:feature_flag:read",
},
```

- [ ] **Step 2: Extend NavItem with optional `module` key**

Modify `NavItem` interface in the same file:

```ts
export interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  perm: string;
  module?: string; // module key — if set, item is hidden when feature is off
  badge?: "approvals" | "notifications";
}
```

Then add `module` to the togglable items:

```ts
{ label: "Leave", to: "/leave/me", icon: Calendar, perm: "leave:request:create:self", module: "leave" },
{ label: "Schedule", to: "/schedule/me", icon: Briefcase, perm: "attendance:clock:self", module: "schedule" },
{ label: "Claims", to: "/claims/me", icon: Receipt, perm: "claim:create:self", module: "claims" },
{ label: "Payslips", to: "/payslips/me", icon: Wallet, perm: "payslip:read:self", module: "payslip" },
{ label: "KPI", to: "/kpi/me", icon: Target, perm: "kpi:assignment:read:self", module: "kpi" },
{ label: "Certifications", to: "/certifications/me", icon: GraduationCap, perm: "cert:read:self", module: "cert" },
// Team
{ label: "Approvals", to: "/approvals", icon: Inbox, perm: "approvals:inbox:read", badge: "approvals", module: "approvals" },
{ label: "Roster", to: "/schedule/roster", icon: ClipboardCheck, perm: "schedule:assignment:write:team", module: "schedule" },
// Admin (existing)
{ label: "Payroll", to: "/payroll/admin", icon: Wallet, perm: "payroll:run:create", module: "payroll" },
{ label: "Reports", to: "/reports", icon: FileSpreadsheet, perm: "report:list", module: "reports" },
{ label: "KPI Admin", to: "/kpi/admin", icon: BarChart3, perm: "kpi:cycle:write", module: "kpi" },
```

`Employees`, `Roles`, `Modules`, `Dashboard`, `My Profile` get NO `module` key — they're always visible (gated by perm only).

- [ ] **Step 3: Wire useFeature into Sidebar**

Modify `apps/web/src/components/shell/Sidebar.tsx` — replace the visibility computation:

```tsx
import { useFeature } from "@/lib/feature-flags";

// Replace canFlags / visibleByPath with two parallel arrays:
const canFlags = ALL_ITEMS.map((item) =>
  item.perm === "" ? true : useCan(item.perm),
);
// biome-ignore lint/correctness/useHookAtTopLevel: ALL_ITEMS is module-constant; hook count fixed.
const featureFlags = ALL_ITEMS.map((item) =>
  item.module ? useFeature(item.module) : true,
);

const visibleByPath = new Map<string, boolean>(
  ALL_ITEMS.map((item, i) => [
    item.to,
    (canFlags[i] ?? false) && (featureFlags[i] ?? true),
  ]),
);
```

- [ ] **Step 4: Wire useFeature into CommandPalette**

Modify `apps/web/src/components/shell/CommandPalette.tsx`:

Add `module` keys to the `PAGES` array (mirroring the sidebar):

```tsx
{ label: "Leave", to: "/leave/me", icon: Calendar, perm: "leave:request:create:self", module: "leave" },
// ... etc, same as Sidebar
```

And update the perm computation:

```tsx
import { useFeature } from "@/lib/feature-flags";

// biome-ignore lint/correctness/useHookAtTopLevel: PAGES is module-constant; hook count is fixed.
const pagePerms = PAGES.map((p) => (p.perm === "" ? true : useCan(p.perm)));
// biome-ignore lint/correctness/useHookAtTopLevel: same reason
const pageFeatures = PAGES.map((p) =>
  p.module ? useFeature(p.module) : true,
);

const visiblePages = PAGES.filter(
  (_, i) => pagePerms[i] && pageFeatures[i],
);
```

Add a `module?: string` field to the `PAGES` item type literal (or define it as a typed const).

- [ ] **Step 5: Run all frontend tests**

Run:
```bash
cd apps/web && pnpm vitest run
cd apps/web && pnpm typecheck
cd apps/web && pnpm run build
```
Expected: ALL PASS. Frontend test count should be ~108 (92 + ~16 new).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/shell/sidebar-nav.ts \
        apps/web/src/components/shell/Sidebar.tsx \
        apps/web/src/components/shell/CommandPalette.tsx
git commit -m "feat(admin): gate sidebar + command palette by feature flags + add admin nav"
```

---

## Task 8: Manual smoke test (read-only)

This is **not** an automated test — it's a checklist for the implementer to walk through the UI before handing off. No commit produced.

- [ ] **Step 1: Sign in as `cyberlab@provintell.com` (org_admin).**

- [ ] **Step 2: Visit `/admin/roles`. See 7 role rows.**

- [ ] **Step 3: Click "Team Lead". Toggle on `claim:approve:team`. Click Save. See success.**

- [ ] **Step 4: Visit `/admin/modules`. Toggle Claims off. See togglable section update + "Off" indicator on derived "Approvals" if you also gate that.**

- [ ] **Step 5: Refresh. Confirm Claims sidebar item is hidden. ⌘K → "Claims" returns no result.**

- [ ] **Step 6: Toggle Claims back on at `/admin/modules`. Refresh. Sidebar shows Claims.**

- [ ] **Step 7: Visit `/employees/{id}`. Confirm RolesCard renders with current roles.**

- [ ] **Step 8: Click "Edit roles". Toggle Manager on. Save. Confirm badge appears.**

If any step fails, file an issue against this sub-plan before moving on.

---

## Acceptance for Sub-plan C

- All frontend tests pass (≥ 108 total)
- `pnpm typecheck` clean
- `pnpm run build` clean
- 8-step manual smoke (Task 8) passes end-to-end
- All four files modified (`App.tsx`, `sidebar-nav.ts`, `Sidebar.tsx`, `CommandPalette.tsx`) build and render without prop-type warnings in the dev console.
