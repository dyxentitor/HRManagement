import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { type EffectiveAccess, userAccessApi } from "../api";

interface Props {
	userId: string;
	name: string;
	onClose: () => void;
}

const SCOPE_STYLE: Record<string, string> = {
	org: "bg-coral/15 text-coral",
	team: "bg-yellow/15 text-yellow",
	self: "bg-mint/15 text-mint",
};

/**
 * Slide-over showing a person's *effective* access: every permission they hold (the union across all
 * their roles) with the source role(s) that grant it — answering "why does this person have X?".
 */
export function EffectiveAccessDrawer({ userId, name, onClose }: Props) {
	const [data, setData] = useState<EffectiveAccess | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);
		userAccessApi
			.effective(userId)
			.then(setData)
			.catch(() => setData(null))
			.finally(() => setLoading(false));
	}, [userId]);

	const totalPerms = data?.modules.reduce((n, m) => n + m.permissions.length, 0) ?? 0;

	return (
		<div className="fixed inset-0 z-50 flex justify-end">
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: overlay close is a convenience; the X button is the labelled control */}
			<div className="absolute inset-0 bg-black/50" onClick={onClose} />
			<aside className="relative w-[440px] max-w-full h-full bg-surface border-l border-border-subtle overflow-auto">
				<header className="sticky top-0 bg-surface/95 backdrop-blur border-b border-border-subtle p-4">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="text-label text-text-tertiary">Effective access</p>
							<h3 className="text-h3 text-text-primary">{name}</h3>
						</div>
						<button
							type="button"
							aria-label="Close"
							onClick={onClose}
							className="text-text-tertiary hover:text-text-primary"
						>
							<X className="size-5" />
						</button>
					</div>
					{data && (
						<div className="mt-2 flex flex-wrap gap-1.5">
							{data.roles.map((r) => (
								<span
									key={r.code}
									className="text-[10px] rounded-full bg-accent-500/15 text-accent-200 px-2 py-0.5"
								>
									{r.name}
								</span>
							))}
							<span className="text-[10px] text-text-tertiary px-1">{totalPerms} permissions</span>
						</div>
					)}
				</header>

				{loading ? (
					<div className="grid place-items-center h-40 text-text-tertiary">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : !data || data.modules.length === 0 ? (
					<p className="text-small text-text-tertiary p-4">
						No access — this person has no permissions.
					</p>
				) : (
					<div className="p-3 space-y-3">
						{data.modules.map((m) => (
							<div key={m.key}>
								<p className="text-label text-text-tertiary px-1 mb-1">{m.label}</p>
								<div className="rounded-xl border border-border-subtle divide-y divide-white/5">
									{m.permissions.map((p) => (
										<div key={p.code} className="flex items-start gap-2 px-3 py-2">
											<span className="flex-1 min-w-0">
												<span className="flex items-center gap-2">
													<span className="text-small text-text-primary">{p.label}</span>
													{p.dangerous && (
														<span className="text-[10px] font-semibold text-coral">
															● sensitive
														</span>
													)}
												</span>
												<span className="block text-[10px] text-text-tertiary">
													via {p.sources.join(", ")}
												</span>
											</span>
											{p.scope && (
												<span
													className={cn(
														"text-[10px] font-semibold px-2 py-0.5 rounded-full self-start",
														SCOPE_STYLE[p.scope],
													)}
												>
													{p.scope}
												</span>
											)}
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</aside>
		</div>
	);
}
