import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	resolve: {
		// Mirrors tsconfig.json `paths` entry `"@/*": ["src/*"]`.
		// Vite resolves `@/foo` by prefix-substituting `@` with the resolved src dir.
		alias: { "@": path.resolve(__dirname, "./src") },
	},
	test: {
		globals: true,
		environment: "happy-dom",
		setupFiles: ["./src/test-setup.ts"],
		coverage: {
			reporter: ["text", "html", "lcov"],
		},
	},
});
