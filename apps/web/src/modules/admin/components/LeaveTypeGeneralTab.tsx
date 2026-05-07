import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { LeaveType } from "../leave-types-api";

type Props = {
	value: LeaveType;
	onChange: (next: LeaveType) => void;
	isCreating?: boolean;
};

export function LeaveTypeGeneralTab({ value, onChange, isCreating }: Props) {
	const update = (patch: Partial<LeaveType>) =>
		onChange({ ...value, ...patch });

	return (
		<div className="grid grid-cols-2 gap-4">
			<div className="flex flex-col gap-1">
				<label htmlFor="lt-code" className="text-sm font-medium">
					Code
				</label>
				<Input
					id="lt-code"
					readOnly={!isCreating}
					value={value.code}
					onChange={(e) => update({ code: e.target.value.toUpperCase() })}
				/>
			</div>
			<div className="flex flex-col gap-1">
				<label htmlFor="lt-name" className="text-sm font-medium">
					Name
				</label>
				<Input
					id="lt-name"
					value={value.name}
					onChange={(e) => update({ name: e.target.value })}
				/>
			</div>
			<div className="flex flex-col gap-1">
				<label htmlFor="lt-accrual" className="text-sm font-medium">
					Accrual type
				</label>
				<Select
					value={value.accrual_type}
					onValueChange={(v) =>
						update({ accrual_type: v as LeaveType["accrual_type"] })
					}
				>
					<SelectTrigger id="lt-accrual">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="annual">Annual</SelectItem>
						<SelectItem value="monthly">Monthly</SelectItem>
						<SelectItem value="event_based">Event-based</SelectItem>
						<SelectItem value="none">No accrual</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-1">
				<label htmlFor="lt-default" className="text-sm font-medium">
					Default days (fallback)
				</label>
				<Input
					id="lt-default"
					type="number"
					step="0.5"
					value={value.default_days}
					onChange={(e) => update({ default_days: e.target.value })}
				/>
			</div>
			<div className="flex items-center gap-2">
				<Switch
					id="lt-paid"
					checked={value.is_paid}
					onCheckedChange={(b) => update({ is_paid: b })}
				/>
				<label htmlFor="lt-paid" className="text-sm">
					Paid leave
				</label>
			</div>
			<div className="flex items-center gap-2">
				<Switch
					id="lt-stat"
					checked={value.is_statutory}
					onCheckedChange={(b) => update({ is_statutory: b })}
				/>
				<label htmlFor="lt-stat" className="text-sm">
					Statutory
				</label>
			</div>
			<div className="flex items-center gap-2">
				<Switch
					id="lt-attach"
					checked={value.requires_attachment}
					onCheckedChange={(b) => update({ requires_attachment: b })}
				/>
				<label htmlFor="lt-attach" className="text-sm">
					Requires attachment
				</label>
			</div>
			<div className="flex flex-col gap-1">
				<label htmlFor="lt-gender" className="text-sm font-medium">
					Gender restriction
				</label>
				<Select
					value={value.gender_restriction}
					onValueChange={(v) =>
						update({
							gender_restriction: v as LeaveType["gender_restriction"],
						})
					}
				>
					<SelectTrigger id="lt-gender">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="any">Any</SelectItem>
						<SelectItem value="male">Male only</SelectItem>
						<SelectItem value="female">Female only</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="col-span-2 mt-4 rounded-md border border-border/50 p-3">
				<p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
					Statutory eligibility (Malaysian Employment Act §60FA / §37)
				</p>
				<div className="grid grid-cols-3 gap-3">
					<div className="flex flex-col gap-1">
						<label htmlFor="lt-rsm" className="text-sm font-medium">
							Service prerequisite (months)
						</label>
						<Input
							id="lt-rsm"
							type="number"
							min={0}
							value={value.requires_service_months}
							onChange={(e) =>
								update({ requires_service_months: Number(e.target.value) })
							}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<label htmlFor="lt-ndr" className="text-sm font-medium">
							Notice days required
						</label>
						<Input
							id="lt-ndr"
							type="number"
							min={0}
							value={value.notice_days_required}
							onChange={(e) =>
								update({ notice_days_required: Number(e.target.value) })
							}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<label htmlFor="lt-mple" className="text-sm font-medium">
							Lifetime events cap (blank = none)
						</label>
						<Input
							id="lt-mple"
							type="number"
							min={0}
							value={value.max_per_lifetime_events ?? ""}
							onChange={(e) =>
								update({
									max_per_lifetime_events: e.target.value
										? Number(e.target.value)
										: null,
								})
							}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
