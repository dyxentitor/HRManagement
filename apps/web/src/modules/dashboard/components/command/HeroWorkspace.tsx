import { Clock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import type {
	AnnouncementItem,
	HeroSummaryData,
	PendingTask,
} from "../../api";

function greeting(d: Date): string {
	const h = d.getHours();
	return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** A one-line summary of what's waiting — the motivational/contextual hook. */
function summaryLine(tasks: PendingTask[], days: number | null): string {
	const total = tasks.reduce((n, t) => n + t.count, 0);
	if (total === 0)
		return days !== null
			? `All clear. Next payroll runs in ${days} day${days === 1 ? "" : "s"}.`
			: "All clear — nothing needs your attention right now.";
	const top = [...tasks].sort((a, b) => b.count - a.count).filter((t) => t.count > 0);
	const lead = top
		.slice(0, 2)
		.map((t) => `${t.count} ${t.label.toLowerCase()}`)
		.join(" and ");
	return `You have ${lead} waiting${days !== null ? ` before the payroll run in ${days} day${days === 1 ? "" : "s"}` : ""}.`;
}

export interface HeroWorkspaceProps {
	firstName: string;
	hero?: HeroSummaryData;
	tasks: PendingTask[];
	featured?: AnnouncementItem;
	cta?: { to: string; label: string };
}

export function HeroWorkspace({
	firstName,
	hero,
	tasks,
	featured,
	cta,
}: HeroWorkspaceProps) {
	const now = new Date();
	const dateLabel = now.toLocaleDateString("en-MY", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	const days = hero?.days_to_payroll ?? null;

	return (
		<section className="relative grid lg:grid-cols-[1.6fr_1fr] rounded-xl overflow-hidden border border-border-subtle min-h-[180px]">
			{/* aurora art */}
			<div className="hero-aurora absolute inset-0" aria-hidden>
				<svg
					viewBox="0 0 1200 200"
					preserveAspectRatio="none"
					className="absolute bottom-0 left-0 w-full opacity-50"
					aria-hidden
				>
					<title>decorative waves</title>
					<path
						d="M0 140 C200 90 380 180 600 130 C820 80 1000 170 1200 120 L1200 200 L0 200 Z"
						fill="rgb(124 92 255 / 0.25)"
					/>
					<path
						d="M0 165 C240 120 420 195 640 155 C880 110 1040 185 1200 150 L1200 200 L0 200 Z"
						fill="rgb(160 207 236 / 0.12)"
					/>
				</svg>
			</div>

			<div className="relative z-10 p-7 flex flex-col justify-center gap-1.5">
				<h1 className="text-[30px] font-extrabold tracking-tight flex items-center gap-2 text-text-primary">
					{greeting(now)}, {firstName}
					<Sparkles className="size-6 text-yellow" aria-hidden />
				</h1>
				<p className="text-small text-accent-200">{dateLabel}</p>
				<p className="text-small text-text-secondary max-w-md mt-0.5">
					{summaryLine(tasks, days)}
				</p>
				<div className="flex items-center gap-3 mt-3.5">
					{cta && (
						<Button asChild className="soft-glow rounded-xl">
							<Link to={cta.to}>{cta.label} →</Link>
						</Button>
					)}
					{days !== null && (
						<div className="flex items-center gap-2.5 bg-canvas/40 border border-border-strong rounded-xl px-3.5 py-2">
							<Clock className="size-4 text-accent-200" aria-hidden />
							<div className="leading-tight">
								<p className="text-h3 text-text-primary">
									{days} day{days === 1 ? "" : "s"}
								</p>
								<p className="text-small text-text-tertiary">
									until payroll
									{hero?.next_payroll_date
										? ` · ${new Date(`${hero.next_payroll_date}T00:00:00Z`).toLocaleDateString("en-MY", { day: "numeric", month: "short", timeZone: "UTC" })}`
										: ""}
								</p>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* featured announcement */}
			{featured && (
				<div className="relative z-10 m-3.5 glass-surface rounded-xl p-4 flex flex-col gap-2">
					<StatusPill tone="yellow" label="★ Featured" className="self-start" />
					<h3 className="text-h2 text-text-primary">{featured.title}</h3>
					<p className="text-small text-text-secondary flex-1 line-clamp-3">
						{featured.body}
					</p>
					<span className="text-small text-accent-200">Read more →</span>
				</div>
			)}
		</section>
	);
}
