import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PayrollStatusData } from "../../api";

export function PayrollProgress({ data }: { data: PayrollStatusData }) {
	return (
		<div className="rounded-xl p-5 border border-border-subtle bg-surface-hover">
			<h3 className="text-label font-semibold text-text-secondary mb-4">
				Payroll progress
			</h3>
			{!data.current ? (
				<p className="text-small text-text-tertiary">No active payroll period.</p>
			) : (
				<>
					<ol className="flex items-start">
						{data.stages.map((s, i) => (
							<li key={s.key} className="flex items-center flex-1 last:flex-none">
								<div className="flex flex-col items-center gap-1.5">
									<span
										className={cn(
											"size-8 rounded-full grid place-items-center text-small font-bold border",
											s.state === "done" && "bg-mint/20 border-mint text-mint",
											s.state === "current" &&
												"bg-accent-500 border-accent-500 text-white soft-glow",
											s.state === "upcoming" &&
												"bg-transparent border-border-strong text-text-tertiary",
										)}
									>
										{s.state === "done" ? <Check className="size-4" aria-hidden /> : i + 1}
									</span>
									<span
										className={cn(
											"text-[10px] leading-tight text-center",
											s.state === "current"
												? "text-text-primary font-semibold"
												: "text-text-tertiary",
										)}
									>
										{s.label}
									</span>
								</div>
								{i < data.stages.length - 1 && (
									<div
										className={cn(
											"h-0.5 flex-1 mx-1 -mt-5",
											s.state === "done" ? "bg-mint/50" : "bg-border-subtle",
										)}
										aria-hidden
									/>
								)}
							</li>
						))}
					</ol>
					{data.pay_date && (
						<p className="text-small text-text-tertiary mt-5">
							Pay date:{" "}
							{new Date(`${data.pay_date}T00:00:00Z`).toLocaleDateString("en-MY", {
								timeZone: "UTC",
							})}
						</p>
					)}
				</>
			)}
		</div>
	);
}
