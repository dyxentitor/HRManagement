import {
	CalendarX,
	Clock,
	FileWarning,
	GraduationCap,
	Sprout,
} from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import type { SmartInsightsData, Tone } from "../../api";

interface Insight {
	icon: ComponentType<{ className?: string }>;
	tone: Tone;
	title: string;
	sub: string;
	show: boolean;
}

const TONE_TEXT: Record<Tone, string> = {
	coral: "text-coral bg-coral/15",
	yellow: "text-yellow bg-yellow/15",
	sky: "text-sky bg-sky/15",
	lavender: "text-lavender bg-lavender/15",
	mint: "text-mint bg-mint/15",
	peach: "text-peach bg-peach/15",
};

export function SmartInsights({ data }: { data: SmartInsightsData }) {
	const insights: Insight[] = [
		{
			icon: Clock,
			tone: "coral",
			title:
				data.payroll_days !== null
					? `Payroll in ${data.payroll_days} day${data.payroll_days === 1 ? "" : "s"}`
					: "No payroll scheduled",
			sub: "Lock before the run",
			show: data.payroll_days !== null && data.payroll_days <= 7,
		},
		{
			icon: FileWarning,
			tone: "yellow",
			title: `${data.missing_docs} missing docs`,
			sub: "Incomplete profiles",
			show: data.missing_docs > 0,
		},
		{
			icon: CalendarX,
			tone: "sky",
			title: `${data.contracts_expiring} contracts expire`,
			sub: "Within 14 days",
			show: data.contracts_expiring > 0,
		},
		{
			icon: GraduationCap,
			tone: "lavender",
			title: `${data.certs_expiring} certs expiring`,
			sub: "Next 30 days",
			show: data.certs_expiring > 0,
		},
		{
			icon: Sprout,
			tone: "mint",
			title: `${data.probation} on probation`,
			sub:
				data.probation_ending > 0
					? `${data.probation_ending} ending this week`
					: "Review progress",
			show: data.probation > 0,
		},
	];
	const visible = insights.filter((i) => i.show);
	if (visible.length === 0) return null;

	return (
		<section>
			<p className="layer-eyebrow mb-2">Layer 5 · Smart insights</p>
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
				{visible.map((it) => (
					<div
						key={it.title}
						className="rounded-xl p-3.5 border border-border-subtle bg-gradient-to-b from-white/[0.04] to-transparent flex gap-2.5 items-start"
					>
						<span
							className={cn(
								"size-8 rounded-lg grid place-items-center shrink-0",
								TONE_TEXT[it.tone],
							)}
							aria-hidden
						>
							<it.icon className="size-4" />
						</span>
						<div className="min-w-0">
							<p className="text-small text-text-primary font-semibold leading-tight">
								{it.title}
							</p>
							<p className="text-small text-text-tertiary">{it.sub}</p>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
