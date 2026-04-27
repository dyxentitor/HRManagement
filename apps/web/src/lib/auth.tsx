import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { ReactNode } from "react";

import { api } from "./api";
import { tokenStorage } from "./token-storage";

export interface AuthUser {
	id: string;
	email: string;
	org_id: string;
	status: string;
	mfa_enabled: boolean;
	preferences: Record<string, unknown>;
	permissions: string[];
}

interface AuthState {
	user: AuthUser | null;
	perms: Set<string>;
	loading: boolean;
}

interface AuthContextValue extends AuthState {
	login: (
		email: string,
		password: string,
	) => Promise<{ mfaRequired: boolean; mfaToken?: string }>;
	loginWithMFA: (mfaToken: string, code: string) => Promise<void>;
	logout: () => Promise<void>;
	refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<AuthUser | null>(null);
	const [loading, setLoading] = useState(true);

	const refreshMe = useCallback(async () => {
		const token = tokenStorage.getAccess();
		if (!token) {
			setUser(null);
			setLoading(false);
			return;
		}
		// biome-ignore lint/suspicious/noExplicitAny: openapi path not in generated spec yet
		const { data, error } = await api.GET("/api/v1/auth/me" as any);
		if (error || !data) {
			setUser(null);
			tokenStorage.clear();
		} else {
			setUser(data as AuthUser);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		refreshMe();
	}, [refreshMe]);

	const login = useCallback(
		async (email: string, password: string) => {
			// biome-ignore lint/suspicious/noExplicitAny: openapi path not in generated spec yet
			const { data, error } = await api.POST("/api/v1/auth/login" as any, {
				body: { email, password },
			});
			if (error) throw new Error("Invalid credentials");
			const body = data as {
				access_token: string;
				refresh_token: string;
				mfa_required?: boolean;
				mfa_token?: string;
			};
			if (body.mfa_required) {
				return { mfaRequired: true, mfaToken: body.mfa_token };
			}
			tokenStorage.set(body.access_token, body.refresh_token);
			await refreshMe();
			return { mfaRequired: false };
		},
		[refreshMe],
	);

	const loginWithMFA = useCallback(
		async (mfaToken: string, code: string) => {
			// biome-ignore lint/suspicious/noExplicitAny: openapi path not in generated spec yet
			const { data, error } = await api.POST("/api/v1/auth/login/mfa" as any, {
				body: { mfa_token: mfaToken, code },
			});
			if (error) throw new Error("Invalid MFA code");
			const body = data as { access_token: string; refresh_token: string };
			tokenStorage.set(body.access_token, body.refresh_token);
			await refreshMe();
		},
		[refreshMe],
	);

	const logout = useCallback(async () => {
		const refresh = tokenStorage.getRefresh();
		if (refresh) {
			// biome-ignore lint/suspicious/noExplicitAny: openapi path not in generated spec yet
			await api.POST("/api/v1/auth/logout" as any, {
				body: { refresh_token: refresh },
			});
		}
		tokenStorage.clear();
		setUser(null);
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({
			user,
			perms: new Set(user?.permissions || []),
			loading,
			login,
			loginWithMFA,
			logout,
			refreshMe,
		}),
		[user, loading, login, loginWithMFA, logout, refreshMe],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
	return ctx;
}
