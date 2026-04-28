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
					// shadcn-compat keys — DEFAULT + foreground for shadcn usage
					DEFAULT: "rgb(var(--accent-500) / <alpha-value>)",
					foreground: "rgb(var(--text-primary) / <alpha-value>)",
					// our numeric scale — preserved for bg-accent-200, text-accent-500, etc.
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

				// CTA — login page only (lime yellow)
				cta: {
					DEFAULT: "rgb(var(--cta) / <alpha-value>)",
					foreground: "rgb(var(--cta-foreground) / <alpha-value>)",
				},

				// shadcn-compat aliases — point shadcn's expected colour names at our tokens
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
				label: [
					"10px",
					{ lineHeight: "14px", fontWeight: "700", letterSpacing: "0.08em" },
				],
			},
			transitionDuration: {
				instant: "var(--motion-instant)",
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
