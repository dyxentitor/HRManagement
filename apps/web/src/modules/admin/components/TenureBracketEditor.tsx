import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { TenureBracket } from "../leave-types-api";

type Props = {
	value: TenureBracket[];
	onChange: (next: TenureBracket[]) => void;
	disabled?: boolean;
};

export function TenureBracketEditor({ value, onChange, disabled }: Props) {
	const update = (idx: number, patch: Partial<TenureBracket>) => {
		const next = value.map((b, i) => (i === idx ? { ...b, ...patch } : b));
		onChange(next);
	};
	const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
	const add = () => onChange([...value, { min_years: 0, days: 0 }]);

	return (
		<div className="flex flex-col gap-2">
			{value.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No tenure tiers yet — falls back to days_per_year.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{value.map((b, idx) => (
						<div
							key={`bracket-${idx}-${b.min_years}`}
							className="flex items-center gap-2"
						>
							<span className="text-sm">≥</span>
							<Input
								type="number"
								min={0}
								className="w-20"
								disabled={disabled}
								value={b.min_years}
								onChange={(e) =>
									update(idx, { min_years: Number(e.target.value) })
								}
							/>
							<span className="text-sm">years →</span>
							<Input
								type="number"
								min={0}
								step={0.5}
								className="w-24"
								disabled={disabled}
								value={b.days}
								onChange={(e) => update(idx, { days: Number(e.target.value) })}
							/>
							<span className="text-sm">days</span>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={disabled}
								aria-label="Remove tier"
								onClick={() => remove(idx)}
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					))}
				</div>
			)}
			<div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={disabled}
					onClick={add}
				>
					<Plus className="mr-2 h-4 w-4" />
					Add tier
				</Button>
			</div>
		</div>
	);
}
