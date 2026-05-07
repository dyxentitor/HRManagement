import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/lib/perm";
import {
	type LeaveOverride,
	type LeaveOverrideWritePayload,
	leaveOverrideApi,
} from "@/modules/admin/leave-overrides-api";
import { type LeaveType, leaveTypeApi } from "@/modules/admin/leave-types-api";

type Props = { employeeId: string };

const todayIso = () => new Date().toISOString().slice(0, 10);

export function LeaveOverrideEditor({ employeeId }: Props) {
	const canWrite = useCan("leave:balance:adjust:org");

	const [overrides, setOverrides] = useState<LeaveOverride[]>([]);
	const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
	const [adding, setAdding] = useState(false);
	const [draft, setDraft] = useState<LeaveOverrideWritePayload>({
		leave_type: "",
		days_override: "0",
		effective_from: todayIso(),
		note: "",
		employee_id: employeeId,
	});

	const refresh = useCallback(() => {
		leaveOverrideApi
			.list(employeeId)
			.then(setOverrides)
			.catch(() => setOverrides([]));
	}, [employeeId]);

	useEffect(() => {
		leaveTypeApi
			.list()
			.then(setLeaveTypes)
			.catch(() => setLeaveTypes([]));
		refresh();
	}, [refresh]);

	if (!canWrite) {
		return null;
	}

	const submit = async () => {
		await leaveOverrideApi.create({ ...draft, employee_id: employeeId });
		setAdding(false);
		setDraft({
			leave_type: "",
			days_override: "0",
			effective_from: todayIso(),
			note: "",
			employee_id: employeeId,
		});
		refresh();
	};

	const remove = async (id: string) => {
		await leaveOverrideApi.remove(id);
		refresh();
	};

	const codeFor = (leaveTypeId: string) =>
		leaveTypes.find((l) => l.id === leaveTypeId)?.code ?? leaveTypeId;

	return (
		<div className="rounded-lg border border-border/50 p-4">
			<div className="mb-3">
				<h3 className="text-sm font-medium">Leave overrides (optional)</h3>
				<p className="text-xs text-muted-foreground">
					Override the default tenure-tier entitlement for this employee. Use
					sparingly — for negotiated terms only.
				</p>
			</div>

			{overrides.length === 0 ? (
				<p className="text-sm text-muted-foreground">No overrides set.</p>
			) : (
				<div className="flex flex-col gap-2">
					{overrides.map((o) => (
						<div
							key={o.id}
							className="flex items-center justify-between rounded border border-border/40 px-3 py-2"
						>
							<div className="text-sm">
								<span className="font-medium">{codeFor(o.leave_type)}</span>{" "}
								<span>{o.days_override} days</span>{" "}
								<span className="text-muted-foreground">
									from {o.effective_from}
									{o.effective_to ? ` to ${o.effective_to}` : ""}
								</span>
								{o.note ? (
									<div className="text-xs italic text-muted-foreground">
										{o.note}
									</div>
								) : null}
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								aria-label="Remove override"
								onClick={() => remove(o.id)}
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					))}
				</div>
			)}

			<Button
				type="button"
				variant="outline"
				size="sm"
				className="mt-3"
				onClick={() => setAdding(true)}
			>
				<Plus className="mr-2 h-4 w-4" />
				Add override
			</Button>

			<Dialog open={adding} onOpenChange={setAdding}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add leave override</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1">
							<label htmlFor="ov-type" className="text-sm font-medium">
								Leave type
							</label>
							<Select
								value={draft.leave_type}
								onValueChange={(v) => setDraft({ ...draft, leave_type: v })}
							>
								<SelectTrigger id="ov-type">
									<SelectValue placeholder="Select leave type" />
								</SelectTrigger>
								<SelectContent>
									{leaveTypes.map((lt) => (
										<SelectItem key={lt.id} value={lt.id}>
											{lt.code} — {lt.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="ov-days" className="text-sm font-medium">
								Days
							</label>
							<Input
								id="ov-days"
								type="number"
								step="0.5"
								value={draft.days_override}
								onChange={(e) =>
									setDraft({ ...draft, days_override: e.target.value })
								}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="ov-from" className="text-sm font-medium">
								Effective from
							</label>
							<Input
								id="ov-from"
								type="date"
								value={draft.effective_from}
								onChange={(e) =>
									setDraft({ ...draft, effective_from: e.target.value })
								}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="ov-note" className="text-sm font-medium">
								Note (optional)
							</label>
							<Textarea
								id="ov-note"
								value={draft.note ?? ""}
								onChange={(e) => setDraft({ ...draft, note: e.target.value })}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setAdding(false)}
						>
							Cancel
						</Button>
						<Button type="button" onClick={submit}>
							Save override
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
