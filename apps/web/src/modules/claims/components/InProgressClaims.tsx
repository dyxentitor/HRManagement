import { ProgressHistoryPanel, StatusPill } from "@/components/hrms";
import { cn } from "@/lib/utils";
import type { ClaimRequest } from "../api";
import {
	STATUS_LABEL,
	STATUS_TONE,
	TONE_CHIP,
	categoryMeta,
	fmtDate,
	fmtMoney,
	isInFlight,
	num,
} from "../lib/claim-ui";
import { ClaimProgressCard } from "./ClaimProgressCard";

function ClaimRow({
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
			className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left border-t border-border-subtle first:border-t-0 hover:bg-surface-elevated/40"
		>
			<span
				className={cn("size-7 rounded-lg grid place-items-center shrink-0", TONE_CHIP[meta.tone])}
				aria-hidden
			>
				<meta.icon className="size-3.5" />
			</span>
			<div className="min-w-0 flex-1">
				<p className="text-small text-text-primary truncate">
					{claim.category_code}
					{claim.merchant ? ` · ${claim.merchant}` : ""}
				</p>
				<p className="text-[10px] text-text-tertiary">{fmtDate(claim.expense_date)}</p>
			</div>
			<span className="text-small text-text-secondary tabular-nums shrink-0">
				{fmtMoney(num(claim.amount), claim.currency_code)}
			</span>
			<StatusPill tone={STATUS_TONE[claim.status]} label={STATUS_LABEL[claim.status]} />
		</button>
	);
}

/** Bounded "In progress / History" section for claims. */
export function InProgressClaims({
	claims,
	onSelect,
}: {
	claims: ClaimRequest[];
	onSelect: (c: ClaimRequest) => void;
}) {
	return (
		<ProgressHistoryPanel
			items={claims}
			isInFlight={(c) => isInFlight(c.status)}
			getKey={(c) => c.id}
			sortValue={(c) => c.expense_date ?? ""}
			cardLimit={2}
			renderCard={(c) => <ClaimProgressCard claim={c} onSelect={onSelect} />}
			renderRow={(c) => <ClaimRow claim={c} onSelect={onSelect} />}
			emptyInProgress="Nothing in progress. You're all settled. 🎉"
			emptyHistory="No claims yet — pick a category below to start."
		/>
	);
}
