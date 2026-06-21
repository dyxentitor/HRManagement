import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

import { employeeApi } from "@/modules/employee/api";
import { StepFooter, StepHeader } from "./chrome";
import type { StepCtx, StepKey } from "./types";

type Me = Record<string, string | null | undefined>;

function Section({
	title,
	editTo,
	ctx,
	children,
}: {
	title: string;
	editTo: StepKey;
	ctx: StepCtx;
	children: React.ReactNode;
}) {
	return (
		<section className="glass-surface rounded-xl p-4">
			<div className="flex items-center justify-between mb-2">
				<p className="layer-eyebrow">{title}</p>
				<button
					type="button"
					onClick={() => ctx.goTo(editTo)}
					className="text-small text-accent-200 hover:underline"
				>
					Edit
				</button>
			</div>
			{children}
		</section>
	);
}

function Row({ k, v }: { k: string; v: string }) {
	return (
		<div className="flex justify-between py-1 text-small border-t border-border-subtle first:border-t-0">
			<span className="text-text-tertiary">{k}</span>
			<span className="text-text-primary">{v || "—"}</span>
		</div>
	);
}

export function ReviewStep({ ctx }: { ctx: StepCtx }) {
	const { user } = useAuth();
	const [me, setMe] = useState<Me | null>(null);
	const p = (user?.preferences ?? {}) as Record<string, unknown>;

	const [loading, setLoading] = useState(true);
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const profile = (await employeeApi.getMe()) as Me | null;
				if (!cancelled) setMe(profile);
			} catch {
				if (!cancelled) setMe(null);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	if (loading) return <Skeleton className="h-72 rounded-xl" />;
	const m = me ?? {};

	return (
		<div className="flex flex-col h-full">
			<StepHeader
				n="Step 5"
				title="Quick review"
				subtitle="Looks good? You can change any of this anytime from your profile and settings."
			/>
			<div className="grid sm:grid-cols-2 gap-3">
				<Section title="Contact" editTo="profile" ctx={ctx}>
					<Row k="Mobile" v={m.phone ?? ""} />
					<Row k="Address" v={m.address_line1 ?? ""} />
					<Row
						k="Emergency"
						v={
							m.emergency_contact_name
								? `${m.emergency_contact_name} · ${m.emergency_contact_phone ?? ""}`
								: ""
						}
					/>
				</Section>
				<Section title="Security" editTo="security" ctx={ctx}>
					<Row k="Password" v="Set" />
					<Row k="Two-factor" v={user?.mfa_enabled ? "Enabled" : "Not set"} />
				</Section>
				<Section title="Preferences" editTo="preferences" ctx={ctx}>
					<Row k="Language" v={String(p.locale ?? "en-MY")} />
					<Row k="Theme" v={String(p.theme ?? "system")} />
					<Row k="Time zone" v={String(p.timezone ?? "Asia/Kuala_Lumpur")} />
				</Section>
			</div>
			<StepFooter onBack={ctx.goBack} primaryLabel="Finish onboarding →" onPrimary={ctx.goNext} />
		</div>
	);
}
