import { Lock } from "lucide-react";
import { Link } from "react-router-dom";

import { useCan } from "@/lib/perm";

import { EmptyState } from "./EmptyState";

const MODULE_LABELS: Record<string, string> = {
	leave: "Leave",
	schedule: "Schedule",
	attendance: "Attendance",
	claims: "Claims",
	payslip: "Payslips",
	kpi: "KPI",
	certification: "Certifications",
	training: "Training",
	reports: "Reports",
	notifications: "Notifications",
	approvals: "Approvals",
	dashboard: "Dashboard",
	feedback: "Feedback",
};

interface ModuleDisabledProps {
	module: string;
}

export function ModuleDisabled({ module }: ModuleDisabledProps) {
	const canEdit = useCan("org:feature_flag:write");
	const label = MODULE_LABELS[module] ?? module;

	return (
		<EmptyState
			icon={<Lock aria-hidden className="size-5" />}
			title={`${label} is currently disabled`}
			description="Your organisation has turned off this module. Contact your administrator if you need access."
			action={
				canEdit ? (
					<Link
						to={`/admin/modules?focus=${module}`}
						className="inline-flex items-center gap-1 text-small text-accent-200 hover:text-accent-100"
					>
						Enable {label} →
					</Link>
				) : undefined
			}
		/>
	);
}
