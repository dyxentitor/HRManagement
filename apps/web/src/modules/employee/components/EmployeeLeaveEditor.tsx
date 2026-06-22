import { useState } from "react";

import { useCan } from "@/lib/perm";

import { AdjustLeaveCard } from "./AdjustLeaveCard";
import { AdjustmentHistory } from "./AdjustmentHistory";
import { LeaveBalanceCard } from "./LeaveBalanceCard";
import { LeaveOverrideCard } from "./LeaveOverrideCard";

/**
 * The single Leave Management workspace (edit page), for org_admin / hr_manager.
 * Vertical priority workflow: current balance → adjust → overrides → history.
 * Renders nothing for anyone else.
 */
export function EmployeeLeaveEditor({ employeeId }: { employeeId: string }) {
	const canManage = useCan("leave:balance:adjust:org");
	// bumped after any change, so the balance + history sections refetch
	const [version, setVersion] = useState(0);
	const refresh = () => setVersion((v) => v + 1);

	if (!canManage) return null;

	return (
		<section className="space-y-3">
			<h2 className="text-h2 text-text-primary">Leave management</h2>
			<div className="space-y-4">
				<LeaveBalanceCard employeeId={employeeId} refreshSignal={version} />
				<AdjustLeaveCard employeeId={employeeId} onChanged={refresh} />
				<LeaveOverrideCard employeeId={employeeId} onChanged={refresh} />
				<AdjustmentHistory employeeId={employeeId} refreshSignal={version} />
			</div>
		</section>
	);
}
