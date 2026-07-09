import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	resolve: {
		// Mirrors tsconfig.json `paths` entry `"@/*": ["src/*"]`.
		// Vite resolves `@/foo` by prefix-substituting `@` with the resolved src dir.
		alias: { "@": path.resolve(__dirname, "./src") },
	},
	server: {
		host: "0.0.0.0",
		port: 5173,
		// Allow any Host header (public IP / domain / dynamic-DNS) to reach the dev server.
		allowedHosts: true,
		proxy: {
			// Target the API by its compose service name — the proxy runs inside the
			// web container, where "localhost" is the web container itself.
			"/api": "http://api:8000",
			"/health": "http://api:8000",
		},
	},
});
