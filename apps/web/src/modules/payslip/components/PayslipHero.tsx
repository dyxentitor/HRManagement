import { Download } from "lucide-react";

import { DonutChart } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import type { PayslipRecord } from "../api";
import {
	type YearSummary,
	fmtMoney,
	isPublished,
	monthLabel,
	num,
	payDateLabel,
} from "../lib/payslip-ui";

export function PayslipHero({
	latest,
	ytd,
	onDownload,
}: {
	latest: PayslipRecord;
	ytd: YearSummary;
	onDownload: (p: PayslipRecord) => void;
}) {
	const net = num(latest.net);
	const ringTotal = ytd.net + ytd.deducted;
	const segments =
		ringTotal > 0
			? ([
					{ value: ytd.net, color: "mint", label: "Net" },
					{ value: ytd.deducted, color: "coral", label: "Deducted" },
				] as const)
			: ([{ value: 1, color: "sky", label: "No pay yet" }] as const);

	return (
		<section className="relative grid lg:grid-cols-[1.6fr_1fr] rounded-2xl overflow-hidden border border-border-subtle min-h-[176px]">
			<div className="hero-aurora absolute inset-0" aria-hidden>
				<svg
					viewBox="0 0 1200 200"
					preserveAspectRatio="none"
					className="absolute bottom-0 left-0 w-full opacity-50"
					aria-hidden
				>
					<title>decorative waves</title>
					<path
						d="M0 140 C200 90 380 180 600 130 C820 80 1000 170 1200 120 L1200 200 L0 200 Z"
						fill="rgb(124 92 255 / 0.25)"
					/>
				</svg>
			</div>

			<div className="relative z-10 p-7 flex flex-col justify-center gap-2">
				<p className="layer-eyebrow text-accent-200">Take-home · {monthLabel(latest)}</p>
				<span className="text-[44px] font-extralight leading-none tracking-tight tabular-nums">
					{fmtMoney(net, latest.currency_code)}
				</span>
				<p className="text-small text-text-secondary">
					Paid {payDateLabel(latest)} · from {fmtMoney(num(latest.gross), latest.currency_code)}{" "}
					gross.
				</p>
				{isPublished(latest) && (
					<div className="mt-3">
						<Button onClick={() => onDownload(latest)} className="soft-glow rounded-xl">
							<Download className="size-4 mr-1.5" /> Download payslip
						</Button>
					</div>
				)}
			</div>

			<div className="relative z-10 m-3.5 glass-surface rounded-xl p-4 flex flex-col justify-center gap-2">
				<p className="layer-eyebrow">This year</p>
				<DonutChart
					size={84}
					segments={segments as never}
					centerLabel={
						<span className="text-small leading-tight">{(ytd.net / 1000).toFixed(1)}k</span>
					}
				/>
				<p className="text-[11px] text-text-tertiary">
					{ytd.count} payslip{ytd.count === 1 ? "" : "s"} this year
				</p>
			</div>
		</section>
	);
}
