import { useEffect, useState } from "react";

import {
	type OrgSettings,
	settingsApi,
} from "@/modules/admin/settings/settings-api";

/** Sidebar header logo. Renders the uploaded company logo when present,
 * falls back to the original gradient square + uppercase org-name text. */
export function OrgLogo() {
	const [org, setOrg] = useState<OrgSettings | null>(null);

	useEffect(() => {
		settingsApi
			.getOrg()
			.then(setOrg)
			.catch(() => undefined);
	}, []);

	if (org?.logo_url) {
		return (
			<img
				src={org.logo_url}
				alt={org.name}
				className="h-7 w-auto max-w-[180px] rounded-md object-contain"
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
