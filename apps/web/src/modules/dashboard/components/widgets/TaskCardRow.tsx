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

const TONE_BG: Record<Tone, string> = {
	peach: "bg-peach",
	lavender: "bg-lavender",
	mint: "bg-mint",
	yellow: "bg-yellow",
	coral: "bg-coral",
	sky: "bg-sky",
};

export function TaskCardRow({ tasks }: { tasks: PendingTask[] }) {
	if (tasks.length === 0) return null;
	return (
		<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
			{tasks.map((t) => {
				const Icon = ICONS[t.key] ?? ClipboardList;
				return (
					<Link
						key={t.key}
						to={t.action_route}
						className="group bg-surface-hover border border-border-subtle rounded-lg p-3 flex flex-col gap-2 transition-transform duration-fast hover:-translate-y-0.5 hover:border-border-strong focus-visible:-translate-y-0.5"
					>
						<div className="flex items-center justify-between">
							<span
								className={cn(
									"size-8 rounded-full grid place-items-center text-canvas",
									TONE_BG[t.tone],
								)}
								aria-hidden
							>
								<Icon className="size-4" />
							</span>
							<span className="text-h1 text-text-primary leading-none tabular-nums">
								{t.count}
							</span>
						</div>
						<p className="text-small text-text-secondary leading-tight">
							{t.label}
						</p>
					</Link>
				);
			})}
		</div>
	);
}
