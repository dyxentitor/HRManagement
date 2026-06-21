import type { PayslipRecord } from "../api";
import { fmtMoney, monthLabel, num } from "../lib/payslip-ui";

function Row({
	label,
	value,
	currency,
	negative = false,
	strong = false,
	net = false,
}: {
	label: string;
	value: number;
	currency: string;
	negative?: boolean;
	strong?: boolean;
	net?: boolean;
}) {
	return (
		<div
			className={`flex justify-between border-t border-border-subtle py-1.5 ${
				net ? "border-t-2 border-border-strong mt-1" : ""
			} ${strong ? "font-semibold" : ""}`}
		>
			<span className={net ? "text-text-primary" : "text-text-secondary"}>{label}</span>
			<span
				className={`tabular-nums ${net ? "text-mint font-bold text-h3" : negative ? "text-coral" : ""}`}
			>
				{negative ? "−" : ""}
				{net
					? fmtMoney(value, currency)
					: value.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
			</span>
		</div>
	);
}

/** The latest payslip as Earnings → Gross → Deductions → Net. */
export function PayslipBreakdown({ payslip }: { payslip: PayslipRecord }) {
	const currency = payslip.currency_code;
	const earnings = Object.entries(payslip.components ?? {});
	const deductions = Object.entries(payslip.deductions ?? {});

	return (
		<section className="glass-surface rounded-2xl p-5">
			<p className="layer-eyebrow mb-3">{monthLabel(payslip)} breakdown</p>

			<p className="text-[10px] uppercase tracking-wide text-text-tertiary mb-1">Earnings</p>
			{earnings.length === 0 ? (
				<Row label="Basic" value={num(payslip.gross)} currency={currency} />
			) : (
				earnings.map(([k, v]) => <Row key={k} label={k} value={num(v)} currency={currency} />)
			)}
			<Row label="Gross" value={num(payslip.gross)} currency={currency} strong />

			<p className="text-[10px] uppercase tracking-wide text-text-tertiary mt-3 mb-1">Deductions</p>
			{deductions.length === 0 ? (
				<Row label="None" value={0} currency={currency} />
			) : (
				deductions.map(([k, v]) => (
					<Row key={k} label={k} value={num(v)} currency={currency} negative />
				))
			)}

			<Row label="Net pay" value={num(payslip.net)} currency={currency} net />
		</section>
	);
}
