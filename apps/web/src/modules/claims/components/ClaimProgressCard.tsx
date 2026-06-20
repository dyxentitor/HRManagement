import { cn } from "@/lib/utils";
import type { ClaimRequest } from "../api";
import { type Tone, categoryMeta, fmtDate, fmtMoney, num, stageNote } from "../lib/claim-ui";
import { ClaimStepper } from "./ClaimStepper";

const ICON_BG: Record<Tone, string> = {
	yellow: "bg-yellow/15 text-yellow",
	sky: "bg-sky/15 text-sky",
	lavender: "bg-lavender/15 text-lavender",
	mint: "bg-mint/15 text-mint",
	coral: "bg-coral/15 text-coral",
	peach: "bg-peach/15 text-peach",
};

const TINT: Record<Tone, string> = {
	yellow: "bg-yellow",
	sky: "bg-sky",
	lavender: "bg-lavender",
	mint: "bg-mint",
	coral: "bg-coral",
	peach: "bg-peach",
};

/** A rich, interactive claim card (replaces flat list rows). */
export function ClaimProgressCard({
	claim,
	onSelect,
}: {
	claim: ClaimRequest;
	onSelect: (c: ClaimRequest) => void;
}) {
	const meta = categoryMeta(`${claim.category_code} ${claim.description}`);
	return (
		<button
			type="button"
			onClick={() => onSelect(claim)}
			className="group relative overflow-hidden glass-surface rounded-2xl p-4 text-left transition-transform duration-fast hover:-translate-y-1 focus-visible:-translate-y-1"
		>
			<span
				className={cn("absolute inset-x-0 top-0 h-16 opacity-10", TINT[meta.tone])}
				aria-hidden
			/>
			<div className="relative flex items-start justify-between">
				<span
					className={cn("size-9 rounded-xl grid place-items-center", ICON_BG[meta.tone])}
					aria-hidden
				>
					<meta.icon className="size-4.5" />
				</span>
				<span className="text-small text-text-tertiary">{fmtDate(claim.expense_date)}</span>
			</div>
			<p className="relative text-2xl font-extralight tracking-tight mt-4 tabular-nums">
				{fmtMoney(num(claim.amount), claim.currency_code)}
			</p>
			<p className="relative text-small text-text-secondary truncate">
				{claim.category_code}
				{claim.merchant ? ` · ${claim.merchant}` : ""}
			</p>
			<div className="relative mt-4">
				<ClaimStepper status={claim.status} />
			</div>
			<p className="relative text-small text-text-tertiary mt-3">{stageNote(claim.status)}</p>
		</button>
	);
}
