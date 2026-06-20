import {
	AlertTriangle,
	CalendarCheck,
	ClipboardList,
	Receipt,
	Target,
	UserPlus,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import type { PendingTask, Tone } from "../../api";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
	leave_approvals: CalendarCheck,
	claim_approvals: Receipt,
	kpi_reviews: Target,
	onboarding: UserPlus,
	payroll_exceptions: AlertTriangle,
	attendance_issues: ClipboardList,
};

const VERB: Record<string, string> = {
	leave_approvals: "Review",
	claim_approvals: "Review",
	kpi_reviews: "Open",
	onboarding: "Continue",
	payroll_exceptions: "Resolve",
	attendance_issues: "Inspect",
};

const TONE_BG: Record<Tone, string> = {
	peach: "bg-peach",
	lavender: "bg-lavender",
	mint: "bg-mint",
	yellow: "bg-yellow",
	coral: "bg-coral",
	sky: "bg-sky",
};

/** Layer 2 — action cards. Each card is work to clear, not a statistic. */
export function TodaysFocus({ tasks }: { tasks: PendingTask[] }) {
	if (tasks.length === 0) return null;
	return (
		<section>
			<p className="layer-eyebrow mb-2">Layer 2 · Today's focus</p>
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
				{tasks.map((t) => {
					const Icon = ICONS[t.key] ?? ClipboardList;
					return (
						<Link
							key={t.key}
							to={t.action_route}
							className="group relative overflow-hidden rounded-xl p-4 border border-border-subtle bg-surface-hover flex flex-col gap-2.5 min-h-[128px] transition-transform duration-fast hover:-translate-y-1 hover:border-border-strong focus-visible:-translate-y-1"
						>
							<span
								className={cn(
									"absolute -top-7 -right-7 size-20 rounded-full blur-2xl opacity-50",
									TONE_BG[t.tone],
								)}
								aria-hidden
							/>
							<div className="relative z-10 flex items-center justify-between">
								<span
									className={cn(
										"size-9 rounded-xl grid place-items-center text-canvas",
										TONE_BG[t.tone],
									)}
									aria-hidden
								>
									<Icon className="size-4.5" />
								</span>
								<span className="text-[30px] font-extrabold leading-none tabular-nums tracking-tight">
									{t.count}
								</span>
							</div>
							<p className="relative z-10 text-small text-text-secondary leading-tight">
								{t.label}
							</p>
							<span className="relative z-10 mt-auto text-small text-text-tertiary group-hover:text-text-secondary">
								{VERB[t.key] ?? "View"} →
							</span>
						</Link>
					);
				})}
			</div>
		</section>
	);
}
