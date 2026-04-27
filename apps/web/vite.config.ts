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
		proxy: {
			"/api": "http://localhost:8000",
			"/health": "http://localhost:8000",
		},
	},
});
