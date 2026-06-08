import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import type { Employee } from "../api";

const GROUP_LABELS: Record<string, string> = {
	contact: "contact",
	personal: "personal details",
	address: "address",
	emergency_contact: "emergency contact",
	bank_details: "bank details",
	tax_ids: "tax IDs",
};

function humanize(key: string): string {
	return GROUP_LABELS[key] ?? key;
}

export function ProfileCompletenessBanner({
	employee,
}: {
	employee: Employee;
}) {
	const completeness = employee.profile_completeness;
	if (!completeness || completeness.percent >= 100) return null;

	const missing = completeness.missing.map(humanize).join(", ");

	return (
		<div className="bg-surface-hover border border-peach/40 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
			<p className="text-body text-text-secondary">
				Profile{" "}
				<span className="text-peach font-medium">
					{completeness.percent}% complete
				</span>
				{missing && (
					<>
						{" "}
						— missing: <span className="text-text-primary">{missing}</span>
					</>
				)}
			</p>
			<Button asChild size="sm" variant="outline" className="shrink-0">
				<Link to={`/employees/${employee.id}/edit`}>Complete profile</Link>
			</Button>
		</div>
	);
}
