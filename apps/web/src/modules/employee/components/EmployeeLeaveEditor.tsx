import { useState } from "react";

import { useCan } from "@/lib/perm";

import { AdjustLeaveCard } from "./AdjustLeaveCard";
import { AdjustmentHistory } from "./AdjustmentHistory";
import { LeaveBalanceCard } from "./LeaveBalanceCard";
import { LeaveOverrideCard } from "./LeaveOverrideCard";

/**
 * The single Leave Management workspace (edit page) for org_admin / hr_manager.
 * Current balance spans the top; below, a two-column grid pairs the editing
 * controls (adjust + overrides) with the read-only adjustment history.
 */
export function EmployeeLeaveEditor({ employeeId }: { employeeId: string }) {
	const canManage = useCan("leave:balance:adjust:org");
	const [version, setVersion] = useState(0);
	const refresh = () => setVersion((v) => v + 1);

	if (!canManage) return null;

	return (
		<section className="bg-surface-hover border border-border-subtle rounded-lg p-4 sm:p-5">
			<header className="flex items-start justify-between gap-2 mb-5">
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

			<div className="space-y-5">
				<LeaveBalanceCard employeeId={employeeId} refreshSignal={version} embedded />

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-5 border-t border-border-subtle/70">
					<div className="space-y-5">
						<AdjustLeaveCard employeeId={employeeId} onChanged={refresh} embedded />
						<div className="pt-5 border-t border-border-subtle/70">
							<LeaveOverrideCard employeeId={employeeId} onChanged={refresh} embedded />
						</div>
					</div>
					<AdjustmentHistory employeeId={employeeId} refreshSignal={version} embedded />
				</div>
			</div>
		</section>
	);
}
