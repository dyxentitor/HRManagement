import { Download } from "lucide-react";

import { StatusPill } from "@/components/hrms";
import type { PayslipRecord } from "../api";
import {
	STATUS_LABEL,
	STATUS_TONE,
	fmtMoney,
	isPublished,
	monthLabel,
	num,
	payDateLabel,
	sortNewestFirst,
} from "../lib/payslip-ui";

export function PayslipHistory({
	payslips,
	onDownload,
}: {
	payslips: PayslipRecord[];
	onDownload: (p: PayslipRecord) => void;
}) {
	const rows = sortNewestFirst(payslips);
	return (
		<section className="glass-surface rounded-2xl p-5">
			<div className="flex items-center justify-between mb-2">
				<p className="layer-eyebrow">Payslip history</p>
				<span className="text-small text-text-tertiary">{rows.length} total</span>
			</div>
			<ul className="max-h-80 overflow-y-auto pr-1">
				{rows.map((p) => (
					<li
						key={p.id}
						className="flex items-center gap-3 py-2.5 border-t border-border-subtle first:border-t-0"
					>
						<div className="min-w-0 flex-1">
							<p className="text-small text-text-primary">{monthLabel(p)}</p>
							<p className="text-[11px] text-text-tertiary">Paid {payDateLabel(p)}</p>
						</div>
						<span className="text-body tabular-nums text-text-primary">
							{fmtMoney(num(p.net), p.currency_code)}
						</span>
						<StatusPill tone={STATUS_TONE[p.status]} label={STATUS_LABEL[p.status]} />
						{isPublished(p) && (
							<button
								type="button"
								onClick={() => onDownload(p)}
								className="inline-flex items-center gap-1 text-small text-accent-200 hover:underline shrink-0"
							>
								<Download className="size-3.5" /> PDF
							</button>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
