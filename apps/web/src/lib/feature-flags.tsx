import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RouteObject } from "react-router-dom";

import { ModuleDisabled } from "@/components/hrms/ModuleDisabled";
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

interface RequireFeatureProps {
	flag: string;
	children: ReactNode;
}

/**
 * Route-level feature gate. Reads the flag map from FeaturesProvider:
 *   - outside provider → fail-open (render children)
 *   - flags still loading → fail-open (render children, no flicker)
 *   - flag explicitly false → render <ModuleDisabled>
 *   - flag missing or true → render children
 *
 * The "loading = render children" branch matches useFeature's existing
 * optimistic contract and prevents a flash of "module disabled" while
 * the flag list is fetching for legit users.
 */
export function RequireFeature({ flag, children }: RequireFeatureProps) {
	const ctx = useContext(FeaturesContext);
	if (!ctx) return <>{children}</>;
	if (!ctx.loaded) return <>{children}</>;
	if (ctx.flags[flag] === false) return <ModuleDisabled module={flag} />;
	return <>{children}</>;
}

/**
 * Apply a single feature gate to every route in `routes`. Used in App.tsx
 * to wrap each module's route array without restructuring its routes.tsx.
 */
export function withFeature(
	flag: string,
	routes: RouteObject[],
): RouteObject[] {
	return routes.map((r) => ({
		...r,
		element: <RequireFeature flag={flag}>{r.element}</RequireFeature>,
	}));
}
