import { TrendingDown, TrendingUp } from "lucide-react";

import { DonutChart, type DonutSegment } from "@/components/hrms";
import type { EmployeeSnapshotData } from "../../api";

export function EmployeeOverview({ data }: { data: EmployeeSnapshotData }) {
	const all: DonutSegment[] = [
		{ value: data.active, color: "mint", label: "Active" },
		{ value: data.on_leave, color: "sky", label: "On leave" },
		{ value: data.on_probation, color: "yellow", label: "Probation" },
		{ value: data.resigned_this_month, color: "coral", label: "Resigned (mo)" },
	];
	const segments = all.filter((s) => s.value > 0);
	const growth = data.monthly_growth ?? 0;
	const up = growth >= 0;

	return (
		<div className="rounded-xl p-5 border border-border-subtle bg-surface-hover h-full flex flex-col">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-label font-semibold text-text-secondary">
					Employee overview
				</h3>
			</div>
			{data.total === 0 ? (
				<p className="text-small text-text-tertiary">No employees yet.</p>
			) : (
				<DonutChart
					size={128}
					segments={segments.length ? segments : [{ value: 1, color: "mint", label: "Active" }]}
					centerLabel={
						<span className="flex flex-col">
							<span className="text-h1 leading-none">
								{data.total.toLocaleString("en-MY")}
							</span>
							<span className="text-small text-text-tertiary">total</span>
						</span>
					}
				/>
			)}
			<div className="mt-auto pt-4 flex items-center gap-1.5 text-small">
				{up ? (
					<TrendingUp className="size-4 text-mint" aria-hidden />
				) : (
					<TrendingDown className="size-4 text-coral" aria-hidden />
				)}
				<span className={up ? "text-mint" : "text-coral"}>
					{up ? "+" : ""}
					{growth}
				</span>
				<span className="text-text-tertiary">net headcount this month</span>
			</div>
		</div>
	);
}
