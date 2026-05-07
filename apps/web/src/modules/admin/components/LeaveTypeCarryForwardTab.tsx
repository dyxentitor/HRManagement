import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Mode = "none" | "capped_no_expiry" | "capped_expiry" | "unlimited";

export type CarryForwardValue = {
	carry_forward_max: string;
	carry_forward_expiry_months: number | null;
};

type Props = {
	value: CarryForwardValue;
	onChange: (next: CarryForwardValue) => void;
};

function deriveMode(v: CarryForwardValue): Mode {
	const max = Number(v.carry_forward_max);
	if (max === 0) return "none";
	if (max >= 99999) return "unlimited";
	if (v.carry_forward_expiry_months) return "capped_expiry";
	return "capped_no_expiry";
}

export function LeaveTypeCarryForwardTab({ value, onChange }: Props) {
	const mode = useMemo(() => deriveMode(value), [value]);

	const setMode = (next: Mode) => {
		switch (next) {
			case "none":
				onChange({ carry_forward_max: "0", carry_forward_expiry_months: null });
				break;
			case "capped_no_expiry":
				onChange({
					carry_forward_max:
						value.carry_forward_max === "0" ? "5" : value.carry_forward_max,
					carry_forward_expiry_months: null,
				});
				break;
			case "capped_expiry":
				onChange({
					carry_forward_max:
						value.carry_forward_max === "0" ? "5" : value.carry_forward_max,
					carry_forward_expiry_months: value.carry_forward_expiry_months ?? 12,
				});
				break;
			case "unlimited":
				onChange({
					carry_forward_max: "99999",
					carry_forward_expiry_months: null,
				});
				break;
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)}>
				<div className="flex items-center gap-2">
					<RadioGroupItem id="cf-none" value="none" />
					<label htmlFor="cf-none" className="text-sm">
						No carry-forward
					</label>
				</div>
				<div className="flex items-center gap-2">
					<RadioGroupItem id="cf-capped" value="capped_no_expiry" />
					<label htmlFor="cf-capped" className="text-sm">
						Capped, no expiry
					</label>
				</div>
				<div className="flex items-center gap-2">
					<RadioGroupItem id="cf-capped-exp" value="capped_expiry" />
					<label htmlFor="cf-capped-exp" className="text-sm">
						Capped with expiry
					</label>
				</div>
				<div className="flex items-center gap-2">
					<RadioGroupItem id="cf-unlim" value="unlimited" />
					<label htmlFor="cf-unlim" className="text-sm">
						Unlimited carry-forward
					</label>
				</div>
			</RadioGroup>

			{(mode === "capped_no_expiry" || mode === "capped_expiry") && (
				<div className="ml-6 flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<label htmlFor="cf-max" className="w-32 text-sm">
							Max days
						</label>
						<Input
							id="cf-max"
							type="number"
							min={1}
							className="w-32"
							value={value.carry_forward_max}
							onChange={(e) =>
								onChange({ ...value, carry_forward_max: e.target.value })
							}
						/>
					</div>
					{mode === "capped_expiry" ? (
						<div className="flex items-center gap-2">
							<label htmlFor="cf-exp" className="w-32 text-sm">
								Expires after
							</label>
							<Input
								id="cf-exp"
								type="number"
								min={1}
								max={12}
								className="w-32"
								value={value.carry_forward_expiry_months ?? ""}
								onChange={(e) =>
									onChange({
										...value,
										carry_forward_expiry_months: Number(e.target.value),
									})
								}
							/>
							<span className="text-sm">months after Jan 1</span>
						</div>
					) : null}
					<p className="ml-32 text-xs text-muted-foreground">
						MY §60E recommends statute maximum 12 months.
					</p>
				</div>
			)}
		</div>
	);
}
