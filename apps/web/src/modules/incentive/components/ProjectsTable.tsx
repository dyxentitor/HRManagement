import { Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { cn } from "@/lib/utils";

import type { OverviewProject } from "../api";

function pct(consumed: string, budget: string): number {
	const b = Number(budget);
	return b > 0 ? Math.min(100, Math.round((Number(consumed) / b) * 100)) : 0;
}

function barTone(p: number): string {
	if (p >= 90) return "from-coral to-peach";
	if (p >= 70) return "from-yellow to-peach";
	return "from-mint to-sky";
}

function DeadlineChip({ deadline }: { deadline: string | null }) {
	if (!deadline) return <span className="text-text-tertiary">—</span>;
	const due = new Date(`${deadline}T00:00:00`);
	const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
	const tone = days < 0 ? "text-coral" : days <= 7 ? "text-yellow" : "text-text-tertiary";
	const label = days < 0 ? "overdue" : days === 0 ? "today" : `${days}d`;
	return (
		<span className={cn("text-[10px]", tone)}>
			{deadline} · {label}
		</span>
	);
}

export function ProjectsTable({ projects }: { projects: OverviewProject[] }) {
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState<"all" | "open" | "closed">("all");
	const [customer, setCustomer] = useState("all");

	const customers = useMemo(
		() => [...new Set(projects.map((p) => p.customer_name))].sort(),
		[projects],
	);

	const rows = useMemo(() => {
		const q = query.toLowerCase();
		return projects.filter(
			(p) =>
				(status === "all" || p.status === status) &&
				(customer === "all" || p.customer_name === customer) &&
				(!q || p.name.toLowerCase().includes(q) || p.customer_name.toLowerCase().includes(q)),
		);
	}, [projects, query, status, customer]);

	const ctrl =
		"bg-canvas border border-border-subtle rounded-md px-2.5 py-1.5 text-small text-text-secondary";

	return (
		<div className="glass-surface rounded-2xl p-4">
			<div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
				<h3 className="text-body font-semibold">Projects</h3>
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1.5 bg-canvas border border-border-subtle rounded-md px-2.5 py-1.5">
						<Search className="size-3.5 text-text-tertiary" />
						<input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search…"
							aria-label="Search projects"
							className="bg-transparent text-small focus:outline-none w-28"
						/>
					</div>
					<select
						value={status}
						onChange={(e) => setStatus(e.target.value as typeof status)}
						aria-label="Status filter"
						className={ctrl}
					>
						<option value="all">All status</option>
						<option value="open">Open</option>
						<option value="closed">Closed</option>
					</select>
					<select
						value={customer}
						onChange={(e) => setCustomer(e.target.value)}
						aria-label="Customer filter"
						className={ctrl}
					>
						<option value="all">All customers</option>
						{customers.map((c) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</select>
				</div>
			</div>

			{rows.length === 0 ? (
				<p className="text-small text-text-tertiary py-6 text-center">No projects match.</p>
			) : (
				<table className="w-full text-small">
					<thead>
						<tr className="text-label text-text-tertiary">
							<th className="text-left font-medium pb-2">Project</th>
							<th className="text-left font-medium pb-2">Budget</th>
							<th className="text-left font-medium pb-2 w-36">Consumed</th>
							<th className="text-left font-medium pb-2">Deadline</th>
							<th className="text-left font-medium pb-2">Status</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((p) => {
							const u = pct(p.consumed, p.budget);
							return (
								<tr key={p.id} className="border-t border-border-subtle">
									<td className="py-2.5">
										<div className="flex items-center gap-1.5">
											<span className="text-text-primary font-medium">{p.name}</span>
											{p.include_soc && <Lock className="size-3 text-text-tertiary" />}
										</div>
										<div className="text-[10px] text-text-tertiary">{p.customer_name}</div>
									</td>
									<td className="py-2.5 text-text-secondary">{p.budget} md</td>
									<td className="py-2.5">
										<div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
											<div
												className={cn("h-full rounded-full bg-gradient-to-r", barTone(u))}
												style={{ width: `${u}%` }}
											/>
										</div>
										<div className="text-[10px] text-text-tertiary mt-1">
											{p.consumed} / {p.budget}
										</div>
									</td>
									<td className="py-2.5">
										<DeadlineChip deadline={p.deadline} />
									</td>
									<td className="py-2.5">
										<StatusPill
											tone={p.status === "open" ? "mint" : "lavender"}
											label={p.status === "open" ? "Open" : "Closed"}
										/>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			)}
		</div>
	);
}
