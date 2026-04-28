# HRMS UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder light-theme top-bar UI with a dark-themed sidebar shell, wire up our design tokens, and install the shadcn/ui primitive library — without touching any individual page body.

**Architecture:** Tokens live as CSS custom properties in `src/index.css` and are exposed to Tailwind via `tailwind.config.ts` so utility classes (`bg-canvas`, `text-secondary`, `accent-500`) Just Work. shadcn/ui primitives are CLI-installed into `src/components/ui/`. The new shell is a single `<AppShell>` that composes `<Sidebar>` + `<TopBar>` + `<Outlet/>`; both nav surfaces use the same `<UserMenu>` dropdown for the user pill.

**Tech Stack:** React 18 · Vite · TypeScript 5.4 · Tailwind 3.4 · shadcn/ui (Radix-backed) · vitest · @testing-library/react · @fontsource-variable/inter · @fontsource/jetbrains-mono.

**Spec reference:** `docs/superpowers/specs/2026-04-28-hrms-ui-redesign.md` §1 (tokens), §2 (shell), §4.1 (primitives), §4.3 (layout).

---

## File map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `apps/web/src/lib/utils.ts` | `cn()` className merge helper for shadcn |
| Modify | `apps/web/src/index.css` | CSS custom-property tokens, font imports, reduced-motion rule, scrollbar |
| Modify | `apps/web/tailwind.config.ts` | Expose tokens as utility classes |
| Modify | `apps/web/package.json` | Add font + shadcn deps |
| Create | `apps/web/components.json` | shadcn config |
| Create | `apps/web/src/components/ui/*.tsx` | 21 primitives (CLI-generated, then committed) |
| Create | `apps/web/src/components/shell/PageHeader.tsx` | Breadcrumb + title + actions slot |
| Create | `apps/web/src/components/shell/PageHeader.test.tsx` | Smoke test |
| Create | `apps/web/src/components/shell/UserMenu.tsx` | Dropdown shared by sidebar pill + topbar pill |
| Create | `apps/web/src/components/shell/UserMenu.test.tsx` | Smoke test |
| Create | `apps/web/src/components/shell/Sidebar.tsx` | Logo + ⌘K + grouped nav + user pill |
| Create | `apps/web/src/components/shell/Sidebar.test.tsx` | Visibility + active-state test |
| Modify | `apps/web/src/components/shell/TopBar.tsx` | Rewrite — breadcrumb/title/⌘K/actions/user pill |
| Modify | `apps/web/src/components/shell/AppShell.tsx` | Compose Sidebar + TopBar + Outlet |
| Create | `apps/web/src/components/shell/AppShell.test.tsx` | Renders signed-in routes inside shell |
| Create | `apps/web/src/components/shell/CommandPalette.tsx` | ⌘K skeleton (populated in Sub-plan 4) |
| Create | `apps/web/src/lib/cmdk.ts` | useCommandPalette() hook with open/close state |

---

## Task 1: Install fonts and shadcn-required deps

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/utils.ts`

- [ ] **Step 1: Add font + shadcn deps**

Run from repo root:

```bash
cd apps/web && npm install \
  @fontsource-variable/inter \
  @fontsource/jetbrains-mono \
  class-variance-authority \
  clsx \
  tailwind-merge \
  tailwindcss-animate \
  lucide-react
```

These give us: variable Inter (single import covers all weights), JetBrains Mono regular, `cva` for variant typing, `clsx`+`tailwind-merge` for the `cn()` helper, animation utilities Tailwind plugin, and the icon library shadcn uses by default.

- [ ] **Step 2: Create the `cn()` helper**

```ts
// apps/web/src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
```

Every shadcn primitive imports `cn` from `@/lib/utils`. The path alias `@/` maps to `src/` via `tsconfig.json` — verify it's already set up.

- [ ] **Step 3: Verify path alias works**

```bash
cd apps/web && cat tsconfig.json | grep -A 4 paths
```

Expected: `"paths": { "@/*": ["src/*"] }`. If missing, add it:

```jsonc
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

Vite needs the alias too — check `vite.config.ts`:

```bash
cat apps/web/vite.config.ts
```

If `resolve.alias` doesn't include `@`, add it:

```ts
import path from "node:path";
// ...
resolve: { alias: { "@": path.resolve(__dirname, "src") } },
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/web && npm run typecheck
```

Expected: PASS. (`utils.ts` is unused but compiles.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/lib/utils.ts \
        apps/web/tsconfig.json apps/web/vite.config.ts
git commit -m "chore(ui): install Inter + JetBrains Mono + shadcn deps"
```

---

## Task 2: Define design tokens

**Files:**
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/tailwind.config.ts`

- [ ] **Step 1: Replace `index.css` with token-rich version**

```css
/* apps/web/src/index.css */
@import "@fontsource-variable/inter";
@import "@fontsource/jetbrains-mono";

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
	:root {
		/* Surfaces & text */
		--bg-canvas: 11 11 20;
		--bg-surface: 21 21 31;
		--bg-hover: 27 27 39;
		--bg-elevated: 30 30 44;
		--text-primary: 255 255 255;
		--text-secondary: 182 184 192;
		--text-tertiary: 110 112 121;
		--text-disabled: 74 77 88;
		--border-subtle: 255 255 255 / 0.06;
		--border-strong: 255 255 255 / 0.12;

		/* Accent — violet */
		--accent-50: 243 239 255;
		--accent-200: 201 188 255;
		--accent-500: 124 92 255;
		--accent-600: 107 79 224;
		--accent-700: 90 64 194;

		/* Pastels — semantic + category */
		--pastel-peach: 252 197 154;
		--pastel-lavender: 191 177 242;
		--pastel-mint: 151 217 199;
		--pastel-yellow: 252 214 133;
		--pastel-coral: 244 160 160;
		--pastel-sky: 160 207 236;

		/* Radii */
		--radius-sm: 0.25rem;
		--radius-md: 0.5rem;
		--radius-lg: 0.75rem;
		--radius-xl: 1.125rem;
		--radius-full: 999px;

		/* Motion */
		--motion-instant: 0ms;
		--motion-fast: 120ms;
		--motion-base: 200ms;
		--motion-slow: 320ms;
		--ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
		--ease-exit: cubic-bezier(0.4, 0, 1, 1);
	}

	html, body, #root {
		height: 100%;
	}

	body {
		font-family: "Inter Variable", system-ui, sans-serif;
		background: rgb(var(--bg-canvas));
		color: rgb(var(--text-primary));
		font-size: 13px;
		line-height: 20px;
		-webkit-font-smoothing: antialiased;
	}

	*:focus-visible {
		outline: 3px solid rgb(var(--accent-500) / 0.4);
		outline-offset: 2px;
		border-radius: 6px;
	}

	::selection {
		background: rgb(var(--accent-500) / 0.4);
	}
}

@media (prefers-reduced-motion: reduce) {
	*, *::before, *::after {
		animation-duration: 0.01ms !important;
		transition-duration: 0.01ms !important;
	}
}

/* Skeleton shimmer */
@keyframes shimmer {
	0% { background-position: -200%; }
	100% { background-position: 200%; }
}
```

The RGB-triplet form (`124 92 255` not `#7C5CFF`) lets Tailwind use them with alpha modifiers (`bg-accent-500/40`).

- [ ] **Step 2: Replace `tailwind.config.ts`**

```ts
// apps/web/tailwind.config.ts
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
	darkMode: "class",
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	theme: {
		extend: {
			colors: {
				canvas: "rgb(var(--bg-canvas) / <alpha-value>)",
				surface: "rgb(var(--bg-surface) / <alpha-value>)",
				"surface-hover": "rgb(var(--bg-hover) / <alpha-value>)",
				"surface-elevated": "rgb(var(--bg-elevated) / <alpha-value>)",
				"text-primary": "rgb(var(--text-primary) / <alpha-value>)",
				"text-secondary": "rgb(var(--text-secondary) / <alpha-value>)",
				"text-tertiary": "rgb(var(--text-tertiary) / <alpha-value>)",
				"text-disabled": "rgb(var(--text-disabled) / <alpha-value>)",
				accent: {
					50: "rgb(var(--accent-50) / <alpha-value>)",
					200: "rgb(var(--accent-200) / <alpha-value>)",
					500: "rgb(var(--accent-500) / <alpha-value>)",
					600: "rgb(var(--accent-600) / <alpha-value>)",
					700: "rgb(var(--accent-700) / <alpha-value>)",
				},
				peach: "rgb(var(--pastel-peach) / <alpha-value>)",
				lavender: "rgb(var(--pastel-lavender) / <alpha-value>)",
				mint: "rgb(var(--pastel-mint) / <alpha-value>)",
				yellow: "rgb(var(--pastel-yellow) / <alpha-value>)",
				coral: "rgb(var(--pastel-coral) / <alpha-value>)",
				sky: "rgb(var(--pastel-sky) / <alpha-value>)",
				"border-subtle": "rgb(var(--border-subtle))",
				"border-strong": "rgb(var(--border-strong))",
			},
			borderRadius: {
				sm: "var(--radius-sm)",
				md: "var(--radius-md)",
				lg: "var(--radius-lg)",
				xl: "var(--radius-xl)",
				full: "var(--radius-full)",
			},
			fontFamily: {
				sans: ['"Inter Variable"', "system-ui", "sans-serif"],
				mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
			},
			fontSize: {
				display: ["32px", { lineHeight: "40px", fontWeight: "700" }],
				h1: ["24px", { lineHeight: "32px", fontWeight: "700" }],
				h2: ["18px", { lineHeight: "26px", fontWeight: "600" }],
				h3: ["14px", { lineHeight: "20px", fontWeight: "600" }],
				body: ["13px", { lineHeight: "20px", fontWeight: "400" }],
				small: ["11px", { lineHeight: "16px", fontWeight: "500" }],
				label: ["10px", { lineHeight: "14px", fontWeight: "700", letterSpacing: "0.08em" }],
			},
			transitionDuration: {
				fast: "var(--motion-fast)",
				base: "var(--motion-base)",
				slow: "var(--motion-slow)",
			},
			transitionTimingFunction: {
				enter: "var(--ease-enter)",
				exit: "var(--ease-exit)",
			},
			animation: {
				shimmer: "shimmer 1.4s infinite linear",
			},
			boxShadow: {
				popover: "0 8px 24px rgba(0,0,0,0.4)",
				modal: "0 16px 48px rgba(0,0,0,0.55)",
				toast: "0 8px 24px rgba(0,0,0,0.4)",
				panel: "-10px 0 40px rgba(0,0,0,0.4)",
			},
		},
	},
	plugins: [animate],
};

export default config;
```

Delete the old `tailwind.config.js` if it exists alongside `tailwind.config.ts`:

```bash
ls apps/web/tailwind.config.*
# if both exist:
rm apps/web/tailwind.config.js
```

- [ ] **Step 3: Verify build**

```bash
cd apps/web && npm run build
```

Expected: PASS — emits `dist/`. Tailwind picks up the new tokens.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/index.css apps/web/tailwind.config.ts
git rm apps/web/tailwind.config.js 2>/dev/null || true
git commit -m "feat(ui): design tokens — surfaces, accents, pastels, type, motion"
```

---

## Task 3: Initialise shadcn/ui

**Files:**
- Create: `apps/web/components.json`
- Create: `apps/web/src/components/ui/*.tsx` (21 files via CLI)

- [ ] **Step 1: Run shadcn init**

```bash
cd apps/web && npx shadcn@latest init
```

Answer the prompts:

| Prompt | Answer |
|--------|--------|
| TypeScript? | yes |
| Style | default (we override via tokens) |
| Base color | slate (we override via tokens) |
| Global CSS file | `src/index.css` |
| Use CSS variables for colors? | yes |
| Tailwind config | `tailwind.config.ts` |
| Import alias for components | `@/components` |
| Import alias for utils | `@/lib/utils` |
| RSC? | no |

This creates `components.json` and `src/components/ui/` empty directory.

- [ ] **Step 2: Override shadcn defaults so it uses our tokens**

After init, edit `apps/web/components.json` to read:

```json
{
	"$schema": "https://ui.shadcn.com/schema.json",
	"style": "default",
	"rsc": false,
	"tsx": true,
	"tailwind": {
		"config": "tailwind.config.ts",
		"css": "src/index.css",
		"baseColor": "slate",
		"cssVariables": true
	},
	"aliases": {
		"components": "@/components",
		"utils": "@/lib/utils",
		"ui": "@/components/ui"
	}
}
```

shadcn init will have added a chunk to `index.css` with its own colour variables (e.g. `--background`, `--foreground`, `--primary`). These conflict with ours. **Delete the entire `:root { ... --background: ...; ... }` block shadcn added** — we'll re-map the names it expects via the Tailwind config below.

- [ ] **Step 3: Map shadcn's expected names to our tokens**

In `tailwind.config.ts`, inside `theme.extend.colors`, append these aliases that mirror shadcn's API to our actual tokens:

```ts
colors: {
	// ... our tokens above ...

	// shadcn-compat aliases (so primitives compile without us forking them)
	background: "rgb(var(--bg-canvas) / <alpha-value>)",
	foreground: "rgb(var(--text-primary) / <alpha-value>)",
	card: {
		DEFAULT: "rgb(var(--bg-surface) / <alpha-value>)",
		foreground: "rgb(var(--text-primary) / <alpha-value>)",
	},
	popover: {
		DEFAULT: "rgb(var(--bg-elevated) / <alpha-value>)",
		foreground: "rgb(var(--text-primary) / <alpha-value>)",
	},
	primary: {
		DEFAULT: "rgb(var(--accent-500) / <alpha-value>)",
		foreground: "rgb(var(--text-primary) / <alpha-value>)",
	},
	secondary: {
		DEFAULT: "rgb(var(--bg-hover) / <alpha-value>)",
		foreground: "rgb(var(--text-secondary) / <alpha-value>)",
	},
	muted: {
		DEFAULT: "rgb(var(--bg-hover) / <alpha-value>)",
		foreground: "rgb(var(--text-tertiary) / <alpha-value>)",
	},
	destructive: {
		DEFAULT: "rgb(var(--pastel-coral) / <alpha-value>)",
		foreground: "rgb(var(--bg-canvas) / <alpha-value>)",
	},
	border: "rgb(var(--border-subtle))",
	input: "rgb(var(--border-subtle))",
	ring: "rgb(var(--accent-500) / <alpha-value>)",
},
```

Also extend the `borderRadius` map shadcn uses (it expects `radius` keys named differently):

```ts
borderRadius: {
	// our existing
	sm: "var(--radius-sm)",
	md: "var(--radius-md)",
	lg: "var(--radius-lg)",
	xl: "var(--radius-xl)",
	full: "var(--radius-full)",
},
```

- [ ] **Step 4: Install all 21 primitives**

```bash
cd apps/web && npx shadcn@latest add \
  button input textarea select checkbox switch radio-group \
  dialog sheet dropdown-menu popover tooltip tabs sonner \
  skeleton avatar scroll-area command calendar progress separator
```

shadcn copies each into `src/components/ui/<name>.tsx`. This is normal — shadcn is "copy-paste-into-your-repo" by design, so we own these files.

- [ ] **Step 5: Verify the primitives compile**

```bash
cd apps/web && npm run typecheck
```

Expected: PASS. If a primitive references a colour name we haven't aliased, fix the missing alias rather than editing the primitive (keeps it upstream-compatible).

- [ ] **Step 6: Smoke-test that a primitive renders**

Create a temp test:

```tsx
// apps/web/src/components/ui/button.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
	it("renders the label and is clickable", () => {
		render(<Button>Approve</Button>);
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
	});
});
```

```bash
cd apps/web && npm test -- src/components/ui/button.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components.json apps/web/src/components/ui/ apps/web/tailwind.config.ts apps/web/src/index.css apps/web/src/components/ui/button.test.tsx
git commit -m "feat(ui): install shadcn/ui primitives, wire to design tokens"
```

---

## Task 4: PageHeader component

**Files:**
- Create: `apps/web/src/components/shell/PageHeader.tsx`
- Test: `apps/web/src/components/shell/PageHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/shell/PageHeader.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
	it("renders title", () => {
		render(<PageHeader title="Employees" />);
		expect(screen.getByRole("heading", { level: 1, name: "Employees" })).toBeInTheDocument();
	});

	it("renders breadcrumb when given", () => {
		render(<PageHeader breadcrumb="Dashboard / My view" title="Hello" />);
		expect(screen.getByText("Dashboard / My view")).toBeInTheDocument();
	});

	it("renders actions slot", () => {
		render(<PageHeader title="Employees" actions={<button type="button">Add</button>} />);
		expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/shell/PageHeader.test.tsx
```

Expected: FAIL — `Cannot find module './PageHeader'`.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/shell/PageHeader.tsx
import type { ReactNode } from "react";

interface PageHeaderProps {
	title: string;
	subtitle?: string;
	breadcrumb?: string;
	actions?: ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumb, actions }: PageHeaderProps) {
	return (
		<header className="flex items-end justify-between gap-4 pb-2">
			<div>
				{breadcrumb && (
					<p className="text-small text-text-tertiary">{breadcrumb}</p>
				)}
				<h1 className="text-h1 text-text-primary mt-0.5">{title}</h1>
				{subtitle && (
					<p className="text-small text-text-secondary mt-1">{subtitle}</p>
				)}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</header>
	);
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/shell/PageHeader.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell/PageHeader.tsx apps/web/src/components/shell/PageHeader.test.tsx
git commit -m "feat(ui): PageHeader — breadcrumb + title + actions slot"
```

---

## Task 5: UserMenu component

**Files:**
- Create: `apps/web/src/components/shell/UserMenu.tsx`
- Test: `apps/web/src/components/shell/UserMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/shell/UserMenu.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { UserMenu } from "./UserMenu";

const mocks = vi.hoisted(() => ({
	logout: vi.fn(),
	user: { email: "admin@provintell.demo" },
	roles: ["org_admin"],
}));

vi.mock("@/lib/auth", () => ({
	useAuth: () => ({ user: mocks.user, logout: mocks.logout, roles: mocks.roles }),
}));

describe("UserMenu", () => {
	it("renders the trigger with user initial", () => {
		render(
			<MemoryRouter>
				<UserMenu />
			</MemoryRouter>,
		);
		expect(screen.getByRole("button", { name: /account menu/i })).toBeInTheDocument();
	});

	it("opens dropdown with profile / preferences / sign-out items", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<UserMenu />
			</MemoryRouter>,
		);
		await user.click(screen.getByRole("button", { name: /account menu/i }));
		expect(screen.getByRole("menuitem", { name: /profile/i })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: /preferences/i })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
	});

	it("calls logout on sign-out click", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<UserMenu />
			</MemoryRouter>,
		);
		await user.click(screen.getByRole("button", { name: /account menu/i }));
		await user.click(screen.getByRole("menuitem", { name: /sign out/i }));
		expect(mocks.logout).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/shell/UserMenu.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/components/shell/UserMenu.tsx
import { Link } from "react-router-dom";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";

function initialsOf(email: string): string {
	const local = email.split("@")[0] ?? email;
	return local.slice(0, 2).toUpperCase();
}

interface UserMenuProps {
	variant?: "compact" | "full";
}

export function UserMenu({ variant = "full" }: UserMenuProps) {
	const { user, logout, roles } = useAuth();
	if (!user) return null;
	const initial = initialsOf(user.email);
	const role = roles[0] ?? "Member";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Account menu"
				className="flex items-center gap-2 rounded-full bg-canvas border border-border-subtle px-1 py-1 pr-3 hover:bg-surface-hover transition-colors duration-fast"
			>
				<span className="size-7 rounded-full bg-gradient-to-br from-lavender to-mint grid place-items-center text-canvas font-bold text-small">
					{initial}
				</span>
				{variant === "full" && (
					<span className="text-left">
						<span className="block text-h3 text-text-primary leading-tight">
							{user.email.split("@")[0]}
						</span>
						<span className="block text-small text-text-tertiary leading-tight">
							{role}
						</span>
					</span>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="bg-surface-elevated border-border-subtle min-w-48">
				<DropdownMenuLabel className="text-text-tertiary text-label">
					{user.email}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/me/profile">Profile</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link to="/me/preferences">Preferences</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => {
						void logout();
					}}
					className="text-coral focus:text-coral"
				>
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```

The `useAuth` hook is the existing one at `apps/web/src/lib/auth.tsx` — verify it exports `roles: string[]` (an array of role codes from `useCan`'s underlying state). If it only exposes individual permissions, expose the role list now:

```bash
grep -n "roles\|userRoles" apps/web/src/lib/auth.tsx
```

If `roles` is missing, add it to the AuthContext value before the test runs (it should already exist from M1, but verify).

- [ ] **Step 4: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/shell/UserMenu.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell/UserMenu.tsx apps/web/src/components/shell/UserMenu.test.tsx
git commit -m "feat(ui): UserMenu dropdown — profile / preferences / sign out"
```

---

## Task 6: Sidebar component

**Files:**
- Create: `apps/web/src/components/shell/Sidebar.tsx`
- Test: `apps/web/src/components/shell/Sidebar.test.tsx`
- Create: `apps/web/src/components/shell/sidebar-nav.ts` (declarative nav config)

- [ ] **Step 1: Define the nav config**

```ts
// apps/web/src/components/shell/sidebar-nav.ts
import {
	BarChart3,
	Briefcase,
	Calendar,
	ClipboardCheck,
	FileSpreadsheet,
	GraduationCap,
	Inbox,
	LayoutDashboard,
	Receipt,
	Target,
	UserCircle,
	Users,
	Wallet,
} from "lucide-react";

import type { ComponentType } from "react";

export interface NavItem {
	label: string;
	to: string;
	icon: ComponentType<{ className?: string }>;
	/** permission code that gates visibility; "" means always visible */
	perm: string;
	/** key used by useNotifBadge to read unread counts */
	badge?: "approvals" | "notifications";
}

export interface NavGroup {
	id: "personal" | "team" | "admin";
	label: string;
	items: NavItem[];
}

export const NAV: NavGroup[] = [
	{
		id: "personal",
		label: "Personal",
		items: [
			{ label: "Dashboard", to: "/", icon: LayoutDashboard, perm: "" },
			{ label: "My Profile", to: "/me/profile", icon: UserCircle, perm: "" },
			{ label: "Leave", to: "/leave/me", icon: Calendar, perm: "leave:request:create:self" },
			{ label: "Schedule", to: "/schedule/me", icon: Briefcase, perm: "attendance:clock:self" },
			{ label: "Claims", to: "/claims/me", icon: Receipt, perm: "claim:create:self" },
			{ label: "Payslips", to: "/payslips/me", icon: Wallet, perm: "payslip:read:self" },
			{ label: "KPI", to: "/kpi/me", icon: Target, perm: "kpi:assignment:read:self" },
			{ label: "Certifications", to: "/certifications/me", icon: GraduationCap, perm: "cert:read:self" },
		],
	},
	{
		id: "team",
		label: "Team",
		items: [
			{
				label: "Approvals",
				to: "/approvals",
				icon: Inbox,
				perm: "approvals:inbox:read",
				badge: "approvals",
			},
			{ label: "Roster", to: "/roster", icon: ClipboardCheck, perm: "schedule:assignment:write:team" },
		],
	},
	{
		id: "admin",
		label: "Admin",
		items: [
			{ label: "Employees", to: "/employees", icon: Users, perm: "employee:read:org" },
			{ label: "Payroll", to: "/payroll", icon: Wallet, perm: "payroll:run:create" },
			{ label: "Reports", to: "/reports", icon: FileSpreadsheet, perm: "report:list" },
			{ label: "KPI Admin", to: "/kpi/admin", icon: BarChart3, perm: "kpi:cycle:write" },
		],
	},
];
```

- [ ] **Step 2: Write the failing test**

```tsx
// apps/web/src/components/shell/Sidebar.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

const mocks = vi.hoisted(() => ({
	perms: new Set<string>(),
	user: { email: "admin@provintell.demo" } as { email: string } | null,
	roles: ["org_admin"],
	logout: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
	useAuth: () => ({ user: mocks.user, logout: mocks.logout, roles: mocks.roles }),
}));
vi.mock("@/lib/perm", () => ({
	useCan: (perm: string) => mocks.perms.has(perm),
}));

describe("Sidebar", () => {
	it("always shows Dashboard and My Profile (zero-perm items)", () => {
		mocks.perms = new Set();
		render(<MemoryRouter><Sidebar /></MemoryRouter>);
		expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /my profile/i })).toBeInTheDocument();
	});

	it("hides items the user can't access", () => {
		mocks.perms = new Set();
		render(<MemoryRouter><Sidebar /></MemoryRouter>);
		expect(screen.queryByRole("link", { name: /payroll/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("link", { name: /approvals/i })).not.toBeInTheDocument();
	});

	it("hides the Team group when no team items are visible", () => {
		mocks.perms = new Set();
		render(<MemoryRouter><Sidebar /></MemoryRouter>);
		expect(screen.queryByText(/^team$/i)).not.toBeInTheDocument();
	});

	it("shows the Admin group when an admin perm is granted", () => {
		mocks.perms = new Set(["employee:read:org"]);
		render(<MemoryRouter><Sidebar /></MemoryRouter>);
		expect(screen.getByText(/^admin$/i)).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /employees/i })).toBeInTheDocument();
	});
});
```

- [ ] **Step 3: Run to confirm fail**

```bash
cd apps/web && npm test -- src/components/shell/Sidebar.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```tsx
// apps/web/src/components/shell/Sidebar.tsx
import { Search } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";
import { useCan } from "@/lib/perm";

import { NAV, type NavGroup, type NavItem } from "./sidebar-nav";
import { UserMenu } from "./UserMenu";

function NavItemLink({ item }: { item: NavItem }) {
	const Icon = item.icon;
	return (
		<NavLink
			to={item.to}
			end={item.to === "/"}
			className={({ isActive }) =>
				cn(
					"flex items-center gap-2 rounded-md px-2.5 py-1.5 text-h3 text-text-secondary transition-colors duration-fast",
					"hover:bg-surface-hover hover:text-text-primary",
					isActive
						? "bg-gradient-to-r from-accent-500/30 to-accent-500/[0.05] text-accent-200 shadow-[inset_0_0_0_1px_rgb(var(--accent-500)/0.4)]"
						: "",
				)
			}
		>
			<Icon className="size-4 shrink-0" aria-hidden />
			<span className="flex-1">{item.label}</span>
		</NavLink>
	);
}

function Group({ group }: { group: NavGroup }) {
	const visible = group.items.filter((item) => item.perm === "" || useCan(item.perm));
	if (visible.length === 0) return null;
	return (
		<>
			<div className="text-label text-text-disabled px-2.5 pt-3 pb-1">{group.label}</div>
			{visible.map((item) => (
				<NavItemLink key={item.to} item={item} />
			))}
		</>
	);
}

export function Sidebar() {
	const dashboard = NAV[0]?.items[0]; // Dashboard is special — top of list, no group label
	const personalRest = NAV[0]?.items.slice(1) ?? [];
	const personalGroup: NavGroup = {
		id: "personal",
		label: "Personal",
		items: personalRest,
	};
	const teamGroup = NAV[1];
	const adminGroup = NAV[2];

	return (
		<aside className="flex flex-col bg-surface rounded-lg p-3 w-[220px] shrink-0">
			<div className="flex items-center gap-2 px-2.5 pt-1 pb-3">
				<span className="size-[22px] rounded-md bg-gradient-to-br from-accent-500 to-lavender" aria-hidden />
				<span className="text-h3 font-bold tracking-wider text-text-primary">PROVINTELL</span>
			</div>

			<button
				type="button"
				className="mx-1 mb-3 flex items-center gap-2 rounded-md bg-canvas border border-border-subtle px-2.5 py-2 text-small text-text-tertiary hover:text-text-secondary"
				aria-label="Open command palette"
			>
				<Search className="size-3.5" aria-hidden />
				<span>⌘K · Search…</span>
			</button>

			{dashboard && <NavItemLink item={dashboard} />}
			<Group group={personalGroup} />
			{teamGroup && <Group group={teamGroup} />}
			{adminGroup && <Group group={adminGroup} />}

			<div className="mt-auto pt-3 border-t border-border-subtle">
				<UserMenu variant="full" />
			</div>
		</aside>
	);
}
```

- [ ] **Step 5: Run to confirm pass**

```bash
cd apps/web && npm test -- src/components/shell/Sidebar.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/shell/Sidebar.tsx apps/web/src/components/shell/Sidebar.test.tsx apps/web/src/components/shell/sidebar-nav.ts
git commit -m "feat(ui): Sidebar — grouped nav with perm-gated items + role-based visibility"
```

---

## Task 7: Rewrite TopBar and AppShell, wire ⌘K skeleton

**Files:**
- Modify: `apps/web/src/components/shell/TopBar.tsx`
- Modify: `apps/web/src/components/shell/AppShell.tsx`
- Create: `apps/web/src/components/shell/CommandPalette.tsx`
- Create: `apps/web/src/lib/cmdk.ts`
- Create: `apps/web/src/components/shell/AppShell.test.tsx`

- [ ] **Step 1: Create the cmdk store hook**

```ts
// apps/web/src/lib/cmdk.ts
import { create } from "zustand";

interface CmdkState {
	open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
}

let storeImpl: typeof create | null = null;
try {
	// zustand may not be installed yet — fall back to React state below
	storeImpl = create;
} catch {
	// noop
}
```

Actually we don't want to introduce zustand for this. Use plain React + a small event-emitter pattern instead:

```ts
// apps/web/src/lib/cmdk.ts
import { useEffect, useState } from "react";

type Listener = (open: boolean) => void;
const listeners = new Set<Listener>();
let _open = false;

export function openCommandPalette() {
	_open = true;
	listeners.forEach((l) => l(true));
}

export function closeCommandPalette() {
	_open = false;
	listeners.forEach((l) => l(false));
}

export function useCommandPalette(): { open: boolean; setOpen: (v: boolean) => void } {
	const [open, setLocal] = useState(_open);
	useEffect(() => {
		const fn: Listener = (v) => setLocal(v);
		listeners.add(fn);
		return () => {
			listeners.delete(fn);
		};
	}, []);
	return {
		open,
		setOpen: (v) => {
			if (v) openCommandPalette();
			else closeCommandPalette();
		},
	};
}
```

- [ ] **Step 2: Create the CommandPalette skeleton (full implementation in Sub-plan 4)**

```tsx
// apps/web/src/components/shell/CommandPalette.tsx
import { useEffect } from "react";

import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { useCommandPalette } from "@/lib/cmdk";

export function CommandPalette() {
	const { open, setOpen } = useCommandPalette();

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen(!open);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, setOpen]);

	return (
		<CommandDialog open={open} onOpenChange={setOpen}>
			<CommandInput placeholder="Search pages, employees, actions…" />
			<CommandList>
				<CommandEmpty>No results — full search lands in v1.1 polish.</CommandEmpty>
				<CommandGroup heading="Pages">
					<CommandItem onSelect={() => setOpen(false)}>Dashboard</CommandItem>
					<CommandItem onSelect={() => setOpen(false)}>My Profile</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
```

- [ ] **Step 3: Rewrite TopBar**

```tsx
// apps/web/src/components/shell/TopBar.tsx
import { Bell, HelpCircle, Search } from "lucide-react";
import { useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useCommandPalette } from "@/lib/cmdk";

import { UserMenu } from "./UserMenu";

function deriveTitle(pathname: string): { breadcrumb: string; title: string } {
	const segs = pathname.split("/").filter(Boolean);
	if (segs.length === 0) return { breadcrumb: "Home", title: "Dashboard" };
	const head = segs[0]!.replace(/-/g, " ");
	const tail = segs[segs.length - 1]!.replace(/-/g, " ");
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	return {
		breadcrumb: segs.slice(0, -1).map(cap).join(" / ") || cap(head),
		title: cap(tail),
	};
}

export function TopBar() {
	const { pathname } = useLocation();
	const { breadcrumb, title } = deriveTitle(pathname);
	const { setOpen } = useCommandPalette();

	return (
		<header className="bg-surface rounded-lg px-4 py-3 flex items-center gap-4">
			<div className="flex-1">
				<p className="text-small text-text-tertiary leading-tight">{breadcrumb}</p>
				<h1 className="text-h2 text-text-primary leading-tight">{title}</h1>
			</div>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="hidden md:flex items-center gap-2 bg-canvas border border-border-subtle rounded-full px-4 py-1.5 text-small text-text-tertiary hover:text-text-secondary w-80"
				aria-label="Open command palette"
			>
				<Search className="size-3.5" aria-hidden />
				<span>⌘K · Search people, claims, leave…</span>
			</button>
			<Button
				variant="ghost"
				size="icon"
				className="rounded-md bg-canvas border border-border-subtle hover:bg-surface-hover"
				aria-label="Help"
			>
				<HelpCircle className="size-4" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="rounded-md bg-canvas border border-border-subtle hover:bg-surface-hover relative"
				aria-label="Notifications"
			>
				<Bell className="size-4" />
				{/* unread pulse — wired in Sub-plan 2 (NotificationCard) */}
			</Button>
			<UserMenu variant="full" />
		</header>
	);
}
```

- [ ] **Step 4: Rewrite AppShell**

```tsx
// apps/web/src/components/shell/AppShell.tsx
import { Outlet } from "react-router-dom";

import { SignedOutGate } from "../SignedOutGate";

import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
	return (
		<SignedOutGate>
			<div className="min-h-screen bg-canvas p-4 grid grid-cols-[220px_1fr] gap-4">
				<Sidebar />
				<div className="flex flex-col gap-4 min-w-0">
					<TopBar />
					<main id="main" className="flex-1 bg-surface rounded-lg p-6 min-w-0">
						<a
							href="#main"
							className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 bg-accent-500 text-white px-3 py-2 rounded-md text-small font-semibold"
						>
							Skip to main content
						</a>
						<Outlet />
					</main>
				</div>
				<CommandPalette />
			</div>
		</SignedOutGate>
	);
}
```

- [ ] **Step 5: Write the AppShell smoke test**

```tsx
// apps/web/src/components/shell/AppShell.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("@/lib/auth", () => ({
	useAuth: () => ({
		user: { email: "admin@provintell.demo" },
		logout: vi.fn(),
		roles: ["org_admin"],
	}),
}));
vi.mock("@/lib/perm", () => ({
	useCan: () => true,
}));
vi.mock("../SignedOutGate", () => ({
	SignedOutGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("AppShell", () => {
	it("renders sidebar, topbar, and an outlet route", () => {
		render(
			<MemoryRouter initialEntries={["/employees"]}>
				<Routes>
					<Route element={<AppShell />}>
						<Route path="/employees" element={<p>employees-route-rendered</p>} />
					</Route>
				</Routes>
			</MemoryRouter>,
		);
		expect(screen.getByText("PROVINTELL")).toBeInTheDocument();
		expect(screen.getByText("employees-route-rendered")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /skip to main content/i })).toBeInTheDocument();
	});
});
```

- [ ] **Step 6: Run all shell tests**

```bash
cd apps/web && npm test -- src/components/shell
```

Expected: PASS (all PageHeader / UserMenu / Sidebar / AppShell tests, ~10 total).

- [ ] **Step 7: Smoke-test in the browser**

Start the dev server (the dev compose stack is already running from earlier):

```bash
cd apps/web && npm run dev
```

Open http://localhost:5173/ and sign in as `admin@provintell.demo` / `Demo!2026`.

Verify visually:
- Dark canvas background, sidebar on the left at 220 px.
- "PROVINTELL" wordmark with gradient mark.
- Grouped nav (Personal / Team / Admin) — Admin group visible because admin user.
- Top bar shows breadcrumb + title.
- ⌘K opens the command palette dialog (with stub items).
- User menu at sidebar bottom + topbar right both work.
- Each old page still renders its content inside the new shell (looks weird styled-wise — that's expected; pages are redesigned in Sub-plan 3).

If anything errors:
```bash
cd apps/web && npm test
cd apps/web && npm run typecheck
cd apps/web && npm run lint
```

- [ ] **Step 8: Final commit**

```bash
git add apps/web/src/components/shell/CommandPalette.tsx \
        apps/web/src/components/shell/TopBar.tsx \
        apps/web/src/components/shell/AppShell.tsx \
        apps/web/src/components/shell/AppShell.test.tsx \
        apps/web/src/lib/cmdk.ts
git commit -m "feat(ui): AppShell + TopBar + CommandPalette skeleton — dark sidebar shell live"
```

---

## Acceptance for Sub-plan 1

- [ ] `npm test` (web) passes — at least 14 frontend tests (10 baseline + ~4 new shell tests + 1 button smoke).
- [ ] `npm run typecheck` (web) passes.
- [ ] `npm run lint` (web) passes.
- [ ] Open the running dev server at http://localhost:5173/ — sign in as admin and visually confirm the new shell wraps every existing page.
- [ ] ⌘K opens the command palette skeleton.
- [ ] Reduced motion: set `Settings → Accessibility → Reduce motion` in the OS, reload — animations should snap.

When all green, Sub-plan 1 is shippable. Move to Sub-plan 2 (composed components).
