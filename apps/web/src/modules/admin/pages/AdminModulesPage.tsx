import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Switch } from "@/components/ui/switch";
import { useFeaturesRefresh } from "@/lib/feature-flags";
import { type FeatureFlag, featureFlagApi } from "../api";

export default function AdminModulesPage() {
	const [flags, setFlags] = useState<FeatureFlag[]>([]);
	const [loading, setLoading] = useState(true);
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const refreshGlobal = useFeaturesRefresh();

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const list = await featureFlagApi.list();
			setFlags(list);
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const onToggle = async (key: string, next: boolean) => {
		setBusyKey(key);
		setErr(null);
		try {
			await featureFlagApi.setEnabled(key, next);
			await load();
			await refreshGlobal();
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Failed to update");
		} finally {
			setBusyKey(null);
		}
	};

	const critical = flags.filter((f) => f.critical);
	const togglable = flags.filter((f) => f.togglable);
	const derived = flags.filter((f) => f.derived);

	return (
		<div className="space-y-6">
			<PageHeader
				title="Modules"
				subtitle="Enable or disable system modules. Disabled modules disappear from the UI for everyone."
			/>
			{err && <div className="text-error text-small">{err}</div>}
			{loading && <div className="text-text-tertiary">Loading…</div>}

			{togglable.length > 0 && (
				<section className="bg-surface rounded-lg p-4">
					<h2 className="text-h2 font-semibold mb-3">Modules</h2>
					<ul className="space-y-3">
						{togglable.map((f) => (
							<li key={f.key} className="flex items-center justify-between">
								<span>{f.label}</span>
								<Switch
									aria-label={f.label}
									checked={f.enabled}
									disabled={busyKey === f.key}
									onCheckedChange={(next) => onToggle(f.key, next)}
								/>
							</li>
						))}
					</ul>
				</section>
			)}

			{critical.length > 0 && (
				<section className="bg-surface rounded-lg p-4">
					<h2 className="text-h2 font-semibold mb-3">Core modules</h2>
					<ul className="space-y-2">
						{critical.map((f) => (
							<li key={f.key} className="flex items-center justify-between">
								<span>{f.label}</span>
								<span className="rounded-full bg-accent-500/20 text-accent-200 px-2 py-0.5 text-small">
									Required
								</span>
							</li>
						))}
					</ul>
				</section>
			)}

			{derived.length > 0 && (
				<section className="bg-surface rounded-lg p-4">
					<h2 className="text-h2 font-semibold mb-3">Derived modules</h2>
					<p className="text-text-tertiary text-small mb-3">
						These follow their parent module's state.
					</p>
					<ul className="space-y-2">
						{derived.map((f) => {
							const deps = (f.depends_on_any ?? f.depends_on ?? []).join(", ");
							return (
								<li key={f.key} className="flex items-center justify-between">
									<span>
										{f.label}{" "}
										{deps && (
											<span className="text-text-tertiary text-small">
												(depends on {deps})
											</span>
										)}
									</span>
									<span
										className={`rounded-full px-2 py-0.5 text-small ${
											f.enabled
												? "bg-success/20 text-success-foreground"
												: "bg-canvas text-text-tertiary"
										}`}
									>
										{f.enabled ? "On" : "Off"}
									</span>
								</li>
							);
						})}
					</ul>
				</section>
			)}
		</div>
	);
}
