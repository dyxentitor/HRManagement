import { useEffect, useState } from "react";

import {
	type NotificationPreference,
	getPreferences,
	updatePreferences,
} from "../api";
import { SECURITY_TYPES } from "../event-labels";

const CHANNELS: Array<"in_app" | "email"> = ["in_app", "email"];

export default function PreferencesPage() {
	const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		getPreferences().then(setPrefs);
	}, []);

	const prefMap = new Map<string, NotificationPreference>();
	for (const p of prefs) {
		prefMap.set(`${p.type}:${p.channel}`, p);
	}

	const types = [...new Set(prefs.map((p) => p.type))].sort();

	function isEnabled(type: string, channel: "in_app" | "email"): boolean {
		return prefMap.get(`${type}:${channel}`)?.enabled ?? true;
	}

	function toggle(type: string, channel: "in_app" | "email") {
		if (SECURITY_TYPES.has(type)) return;
		setPrefs((prev) =>
			prev.map((p) =>
				p.type === type && p.channel === channel
					? { ...p, enabled: !p.enabled }
					: p,
			),
		);
	}

	async function save() {
		setSaving(true);
		const updates = prefs
			.filter((p) => !SECURITY_TYPES.has(p.type))
			.map((p) => ({ type: p.type, channel: p.channel, enabled: p.enabled }));
		await updatePreferences(updates);
		setSaving(false);
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
	}

	return (
		<div className="p-6 max-w-3xl">
			<h1 className="text-xl font-semibold mb-4">Notification Preferences</h1>
			<table className="w-full text-sm border-collapse">
				<thead>
					<tr className="border-b border-border-subtle">
						<th className="text-left py-2 pr-4 text-text-secondary">Event</th>
						{CHANNELS.map((ch) => (
							<th
								key={ch}
								className="text-center py-2 px-3 capitalize text-text-secondary"
							>
								{ch.replace("_", " ")}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{types.map((type) => (
						<tr
							key={type}
							className="border-b border-border-subtle hover:bg-surface-hover transition-colors"
						>
							<td className="py-2 pr-4 font-mono text-xs text-text-secondary">
								{type}
								{SECURITY_TYPES.has(type) && (
									<span className="ml-2 text-yellow text-xs">(security)</span>
								)}
							</td>
							{CHANNELS.map((ch) => (
								<td key={ch} className="text-center py-2 px-3">
									<input
										type="checkbox"
										checked={isEnabled(type, ch)}
										disabled={SECURITY_TYPES.has(type)}
										onChange={() => toggle(type, ch)}
										className="cursor-pointer disabled:cursor-not-allowed"
									/>
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
			<div className="mt-4 flex items-center gap-3">
				<button
					type="button"
					onClick={save}
					disabled={saving}
					className="px-4 py-2 bg-accent-500 text-white rounded text-sm hover:bg-accent-600 disabled:opacity-50"
				>
					{saving ? "Saving…" : "Save preferences"}
				</button>
				{saved && <span className="text-mint text-sm">Saved!</span>}
			</div>
		</div>
	);
}
