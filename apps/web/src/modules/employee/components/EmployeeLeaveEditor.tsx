import { useCan } from "@/lib/perm";

import { AdjustLeaveCard } from "./AdjustLeaveCard";
import { LeaveOverrideCard } from "./LeaveOverrideCard";

/**
 * Edit-page leave management for org_admin / hr_manager — entitlement overrides
 * and one-off adjustments, side by side. Renders nothing for anyone else.
 */
export function EmployeeLeaveEditor({ employeeId }: { employeeId: string }) {
	const canManage = useCan("leave:balance:adjust:org");
	if (!canManage) return null;

	return (
		<section className="space-y-3">
			<h2 className="text-h3 text-text-primary">Leave management</h2>
			<div className="grid lg:grid-cols-2 gap-4 items-start">
				<LeaveOverrideCard employeeId={employeeId} />
				<AdjustLeaveCard employeeId={employeeId} />
			</div>
		</section>
	);
}
