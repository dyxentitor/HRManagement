import { useEffect, useState } from "react";

import { type OrgBranding, settingsApi } from "@/modules/admin/settings/settings-api";

export type LogoMode = "landscape" | "legacy";

/** Landscape = a single wide wordmark image (uploaded logo, or the bundled default).
 *  Legacy = the mark + uppercase org-name lockup. */
export function readLogoMode(settings: Record<string, unknown> | undefined | null): LogoMode {
	return (settings?.logo_mode as LogoMode) === "legacy" ? "legacy" : "landscape";
}

/** Sidebar header logo. Honours the org's `settings.logo_mode`:
 *  - "landscape" → the wide wordmark (uploaded `logo_url`, else the bundled `/logo.png`)
 *  - "legacy"    → the gradient mark + uppercase org name */
export function OrgLogo() {
	const [org, setOrg] = useState<OrgBranding | null>(null);

	useEffect(() => {
		// Branding is open to any authenticated user, so this no longer 403s for
		// manager/employee-tier users the way the full getOrg() did.
		settingsApi
			.getBranding()
			.then(setOrg)
			.catch(() => undefined);
	}, []);

	const mode: LogoMode = org?.logo_mode === "legacy" ? "legacy" : "landscape";

	if (mode === "landscape") {
		return (
			<img
				src={org?.logo_url ?? "/logo.png"}
				alt={org?.name ?? "Provintell"}
				className="h-6 w-auto max-w-[170px] object-contain"
			/>
		);
	}

	return (
		<>
			<span
				className="size-[22px] rounded-md bg-gradient-to-br from-accent-500 to-lavender"
				aria-hidden
			/>
			<span className="text-h3 font-bold tracking-wider text-text-primary">
				{(org?.name ?? "PROVINTELL").toUpperCase()}
			</span>
		</>
	);
}
