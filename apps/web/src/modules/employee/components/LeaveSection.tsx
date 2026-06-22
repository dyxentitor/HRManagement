import { useCan } from "@/lib/perm";

import { LeaveBalanceCard } from "./LeaveBalanceCard";
import { LeaveOverrideCard } from "./LeaveOverrideCard";

/**
 * The profile "Leave" block. HR/Admin see a two-column row — balances on the left,
 * inline entitlement-override CRUD on the right. Everyone else sees just the
 * (read-only) balance card, full width.
 */
export function LeaveSection({ employeeId }: { employeeId: string }) {
	const canManage = useCan("leave:balance:adjust:org");

	if (!canManage) return <LeaveBalanceCard employeeId={employeeId} />;

	return (
		<div className="grid lg:grid-cols-2 gap-4 items-start">
			<LeaveBalanceCard employeeId={employeeId} />
			<LeaveOverrideCard employeeId={employeeId} />
		</div>
	);
}
