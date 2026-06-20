import type {
	ActivityFeedData,
	EmployeeSnapshotData,
	PayrollStatusData,
} from "../../api";
import { ActivityTimeline } from "./ActivityTimeline";
import { EmployeeOverview } from "./EmployeeOverview";
import { PayrollProgress } from "./PayrollProgress";
import { QuickActions } from "./QuickActions";

export interface OperationalWorkspaceProps {
	snapshot?: EmployeeSnapshotData;
	payroll?: PayrollStatusData;
	activity?: ActivityFeedData;
	perms: Set<string>;
}

/** Layer 3 — asymmetrical bento. Cards vary in size to create rhythm. */
export function OperationalWorkspace({
	snapshot,
	payroll,
	activity,
	perms,
}: OperationalWorkspaceProps) {
	return (
		<section>
			<p className="layer-eyebrow mb-2">Layer 3 · Operational workspace</p>
			<div className="grid lg:grid-cols-3 gap-4 lg:[grid-auto-rows:minmax(0,auto)]">
				{snapshot && (
					<div className="lg:row-span-2">
						<EmployeeOverview data={snapshot} />
					</div>
				)}
				{payroll && <PayrollProgress data={payroll} />}
				{activity && (
					<div className="lg:row-span-2">
						<ActivityTimeline data={activity} />
					</div>
				)}
				<div className="lg:col-span-1">
					<QuickActions perms={perms} />
				</div>
			</div>
		</section>
	);
}
