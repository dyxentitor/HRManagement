import { useState } from "react";

import { useCan } from "@/lib/perm";

import { AdjustLeaveCard } from "./AdjustLeaveCard";
import { AdjustmentHistory } from "./AdjustmentHistory";
import { LeaveBalanceCard } from "./LeaveBalanceCard";
import { LeaveOverrideCard } from "./LeaveOverrideCard";

/**
 * The single Leave Management workspace (edit page) for org_admin / hr_manager.
 * One section — consistent with the other employee-form sections — holding a
 * vertical workflow: current balance → adjust → overrides → history.
 */
export function EmployeeLeaveEditor({ employeeId }: { employeeId: string }) {
	const canManage = useCan("leave:balance:adjust:org");
	const [version, setVersion] = useState(0);
	const refresh = () => setVersion((v) => v + 1);

	if (!canManage) return null;

	return (
		<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<header className="flex items-start justify-between gap-2 mb-4">
				<div>
					<h2 className="text-h3 text-text-primary">Leave management</h2>
					<p className="text-small text-text-tertiary">
						Manage leave balances, overrides, and adjustment history.
					</p>
				</div>
				<span className="text-[10px] font-bold uppercase tracking-wider text-accent-200 bg-accent-500/15 border border-accent-500/40 px-2 py-0.5 rounded-full shrink-0">
					HR only
				</span>
			</header>

			<div className="divide-y divide-border-subtle/70">
				<div className="pb-4">
					<LeaveBalanceCard employeeId={employeeId} refreshSignal={version} embedded />
				</div>
				<div className="py-4">
					<AdjustLeaveCard employeeId={employeeId} onChanged={refresh} embedded />
				</div>
				<div className="py-4">
					<LeaveOverrideCard employeeId={employeeId} onChanged={refresh} embedded />
				</div>
				<div className="pt-4">
					<AdjustmentHistory employeeId={employeeId} refreshSignal={version} embedded />
				</div>
			</div>
		</section>
	);
}
