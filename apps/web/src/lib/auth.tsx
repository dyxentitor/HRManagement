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
	role_codes: string[];
}

interface AuthState {
	user: AuthUser | null;
	perms: Set<string>;
	loading: boolean;
}

interface AuthContextValue extends AuthState {
	roles: string[];
	mustChangePassword: boolean;
	login: (
		email: string,
		password: string,
	) => Promise<{ mfaRequired: boolean; mfaToken?: string }>;
	loginWithMFA: (mfaToken: string, code: string) => Promise<void>;
	logout: () => Promise<void>;
	refreshMe: () => Promise<void>;
	clearMustChangePassword: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<AuthUser | null>(null);
	const [loading, setLoading] = useState(true);
	const [mustChangePassword, setMustChangePassword] = useState(false);

	const refreshMe = useCallback(async () => {
		const token = tokenStorage.getAccess();
		if (!token) {
			setUser(null);
			setLoading(false);
			return;
		}
		const { data, error } = await api.GET("/api/v1/auth/me");
		if (error || !data) {
			setUser(null);
			tokenStorage.clear();
		} else {
			setUser(data as unknown as AuthUser);
			// must_change_password is not in the typed contract (auth views lack
			// @extend_schema), so read it via a cast.
			setMustChangePassword(
				(data as { must_change_password?: boolean }).must_change_password ===
					true,
			);
		}
		setLoading(false);
	}, []);

	const clearMustChangePassword = useCallback(() => {
		setMustChangePassword(false);
	}, []);

	useEffect(() => {
		refreshMe();
	}, [refreshMe]);

	const login = useCallback(
		async (email: string, password: string) => {
			// The generated spec marks requestBody as never due to a spec generation gap;
			// cast through unknown to pass the actual runtime body.
			const { data, error } = await api.POST("/api/v1/auth/login", {
				body: { email, password } as unknown as undefined,
			});
			if (error) throw new Error("Invalid credentials");
			const body = data as unknown as {
				access_token: string;
				refresh_token: string;
				mfa_required?: boolean;
				mfa_token?: string;
				// Not in the typed contract — read via cast.
				must_change_password?: boolean;
			};
			if (body.mfa_required) {
				return { mfaRequired: true, mfaToken: body.mfa_token };
			}
			tokenStorage.set(body.access_token, body.refresh_token);
			setMustChangePassword(body.must_change_password === true);
			await refreshMe();
			return { mfaRequired: false };
		},
		[refreshMe],
	);

	const loginWithMFA = useCallback(
		async (mfaToken: string, code: string) => {
			// Same spec generation gap — cast body through unknown
			const { data, error } = await api.POST("/api/v1/auth/login/mfa", {
				body: { mfa_token: mfaToken, code } as unknown as undefined,
			});
			if (error) throw new Error("Invalid MFA code");
			const body = data as unknown as {
				access_token: string;
				refresh_token: string;
			};
			tokenStorage.set(body.access_token, body.refresh_token);
			await refreshMe();
		},
		[refreshMe],
	);

	const logout = useCallback(async () => {
		const refresh = tokenStorage.getRefresh();
		if (refresh) {
			await api.POST("/api/v1/auth/logout", {
				body: { refresh_token: refresh } as unknown as undefined,
			});
		}
		tokenStorage.clear();
		setUser(null);
		setMustChangePassword(false);
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({
			user,
			perms: new Set(user?.permissions || []),
			roles: user?.role_codes ?? [],
			loading,
			mustChangePassword,
			login,
			loginWithMFA,
			logout,
			refreshMe,
			clearMustChangePassword,
		}),
		[
			user,
			loading,
			mustChangePassword,
			login,
			loginWithMFA,
			logout,
			refreshMe,
			clearMustChangePassword,
		],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
	return ctx;
}
