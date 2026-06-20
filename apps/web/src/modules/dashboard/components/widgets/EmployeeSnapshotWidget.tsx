import { DonutChart, type DonutSegment } from "@/components/hrms";
import type { EmployeeSnapshotData } from "../../api";
import { WidgetCard } from "./WidgetCard";

export function EmployeeSnapshotWidget({ data }: { data: EmployeeSnapshotData }) {
	const allSegments: DonutSegment[] = [
		{ value: data.active, color: "mint", label: "Active" },
		{ value: data.on_leave, color: "sky", label: "On leave" },
		{ value: data.on_probation, color: "yellow", label: "Probation" },
		{ value: data.resigned_this_month, color: "coral", label: "Resigned (mo)" },
	];
	const segments = allSegments.filter((s) => s.value > 0);

	return (
		<WidgetCard title="Employee overview">
			{data.total === 0 ? (
				<p className="text-small text-text-tertiary">No employees yet.</p>
			) : (
				<DonutChart
					segments={
						segments.length
							? segments
							: [{ value: 1, color: "mint", label: "Active" }]
					}
					centerLabel={
						<span className="flex flex-col">
							<span className="text-h1 leading-none">{data.total}</span>
							<span className="text-small text-text-tertiary">total</span>
						</span>
					}
				/>
			)}
		</WidgetCard>
	);
}
