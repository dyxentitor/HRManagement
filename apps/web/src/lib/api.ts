import createClient from "openapi-fetch";

import type { paths } from "@hrms/contracts/generated";
import { tokenStorage } from "./token-storage";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
	if (refreshing) return refreshing;
	const refresh = tokenStorage.getRefresh();
	if (!refresh) return false;

	refreshing = (async () => {
		try {
			const resp = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refresh_token: refresh }),
			});
			if (!resp.ok) return false;
			const body = await resp.json();
			tokenStorage.set(body.access_token, body.refresh_token);
			return true;
		} finally {
			refreshing = null;
		}
	})();

	return refreshing;
}

const baseClient = createClient<paths>({ baseUrl: BASE_URL });

baseClient.use({
	async onRequest({ request }) {
		const token = tokenStorage.getAccess();
		if (token) request.headers.set("Authorization", `Bearer ${token}`);
		return request;
	},
	async onResponse({ request, response }) {
		if (response.status !== 401) return response;
		if (
			request.url.endsWith("/auth/login") ||
			request.url.endsWith("/auth/refresh")
		) {
			return response; // don't retry login/refresh failures
		}
		const ok = await refreshTokens();
		if (!ok) return response;
		// Retry the original request with the new token
		const token = tokenStorage.getAccess();
		const retryHeaders = new Headers(request.headers);
		if (token) retryHeaders.set("Authorization", `Bearer ${token}`);
		return fetch(request.url, {
			method: request.method,
			headers: retryHeaders,
			body: request.body,
		});
	},
});

export const api = baseClient;
