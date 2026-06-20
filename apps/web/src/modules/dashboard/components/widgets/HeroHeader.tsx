import { CalendarClock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import type { HeroSummaryData } from "../../api";

function greeting(date: Date): string {
	const h = date.getHours();
	if (h < 12) return "Good morning";
	if (h < 18) return "Good afternoon";
	return "Good evening";
}

function titleCase(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface HeroHeaderProps {
	firstName: string;
	data?: HeroSummaryData;
	/** primary CTA — route + label, gated by caller */
	cta?: { to: string; label: string };
}

export function HeroHeader({ firstName, data, cta }: HeroHeaderProps) {
	const now = new Date();
	const dateLabel = now.toLocaleDateString("en-MY", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	const days = data?.days_to_payroll ?? null;

	return (
		<section className="bg-gradient-to-br from-accent-700/40 via-surface-hover to-surface-hover border border-border-subtle rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
			<div className="min-w-0">
				<h2 className="text-h1 text-text-primary flex items-center gap-2">
					{greeting(now)}, {firstName}
					<Sparkles className="size-5 text-yellow" aria-hidden />
				</h2>
				<p className="text-small text-text-tertiary mt-1">{dateLabel}</p>
			</div>

			<div className="flex items-center gap-3">
				{days !== null && (
					<div className="bg-canvas/60 border border-border-subtle rounded-lg px-4 py-2.5 flex items-center gap-3">
						<CalendarClock className="size-5 text-accent-200" aria-hidden />
						<div>
							<p className="text-h2 text-text-primary leading-none">
								{days} {days === 1 ? "day" : "days"}
							</p>
							<p className="text-small text-text-tertiary mt-0.5">
								until payroll
							</p>
						</div>
					</div>
				)}
				{cta && (
					<Button asChild>
						<Link to={cta.to}>{titleCase(cta.label)}</Link>
					</Button>
				)}
			</div>
		</section>
	);
}
