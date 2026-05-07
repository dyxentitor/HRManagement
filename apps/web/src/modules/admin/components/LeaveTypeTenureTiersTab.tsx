import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import {
	type LeavePolicy,
	type TenureBracket,
	leavePolicyApi,
} from "../leave-types-api";
import { TenureBracketEditor } from "./TenureBracketEditor";

type Props = {
	leaveTypeId: string;
};

export function LeaveTypeTenureTiersTab({ leaveTypeId }: Props) {
	const [policies, setPolicies] = useState<LeavePolicy[]>([]);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(() => {
		leavePolicyApi
			.list(leaveTypeId)
			.then((rows) => {
				setPolicies(rows);
				setError(null);
			})
			.catch(() => {
				setPolicies([]);
				setError("Could not load policies");
			});
	}, [leaveTypeId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const updateBrackets = async (
		policy: LeavePolicy,
		brackets: TenureBracket[],
	) => {
		try {
			await leavePolicyApi.update(policy.id, { tenure_brackets: brackets });
			refresh();
		} catch {
			setError("Could not save brackets");
		}
	};

	const createPolicy = async () => {
		const today = new Date().toISOString().slice(0, 10);
		try {
			await leavePolicyApi.create({
				leave_type: leaveTypeId,
				applies_to_role_id: null,
				applies_to_department_id: null,
				days_per_year: "8",
				tenure_brackets: [],
				effective_from: today,
				effective_to: null,
			});
			refresh();
		} catch {
			setError("Could not create policy");
		}
	};

	return (
		<div className="flex flex-col gap-4">
			{error && <p className="text-sm text-red-500">{error}</p>}
			{policies.length === 0 && !error ? (
				<p className="text-sm text-muted-foreground">
					No policies for this leave type yet — create one to define tenure
					tiers.
				</p>
			) : null}
			{policies.map((p) => (
				<div key={p.id} className="rounded-lg border border-border/50 p-4">
					<div className="mb-2 flex items-center justify-between">
						<div className="text-sm">
							Effective from <strong>{p.effective_from}</strong> · Scope:{" "}
							{p.applies_to_role_id || p.applies_to_department_id
								? "Role/Department"
								: "All employees"}
						</div>
						<div className="text-sm text-muted-foreground">
							Fallback: {p.days_per_year} days/year
						</div>
					</div>
					<TenureBracketEditor
						value={p.tenure_brackets}
						onChange={(next) => updateBrackets(p, next)}
					/>
				</div>
			))}
			<Button type="button" variant="outline" onClick={createPolicy}>
				<Plus className="mr-2 h-4 w-4" />
				New policy
			</Button>
		</div>
	);
}
