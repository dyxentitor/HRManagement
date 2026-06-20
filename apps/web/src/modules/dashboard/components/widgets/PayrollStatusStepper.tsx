import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PayrollStatusData } from "../../api";
import { WidgetCard } from "./WidgetCard";

export function PayrollStatusStepper({ data }: { data: PayrollStatusData }) {
	if (!data.current) {
		return (
			<WidgetCard title="Payroll status">
				<p className="text-small text-text-tertiary">No active payroll period.</p>
			</WidgetCard>
		);
	}
	return (
		<WidgetCard title="Payroll status">
			<ol className="flex items-center">
				{data.stages.map((s, i) => (
					<li key={s.key} className="flex items-center flex-1 last:flex-none">
						<div className="flex flex-col items-center gap-1.5">
							<span
								className={cn(
									"size-7 rounded-full grid place-items-center text-small font-semibold border",
									s.state === "done" &&
										"bg-mint/20 border-mint text-mint",
									s.state === "current" &&
										"bg-accent-500 border-accent-500 text-white",
									s.state === "upcoming" &&
										"bg-transparent border-border-strong text-text-tertiary",
								)}
							>
								{s.state === "done" ? (
									<Check className="size-3.5" aria-hidden />
								) : (
									i + 1
								)}
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
									"h-px flex-1 mx-1 -mt-5",
									s.state === "done" ? "bg-mint/50" : "bg-border-subtle",
								)}
								aria-hidden
							/>
						)}
					</li>
				))}
			</ol>
			{data.pay_date && (
				<p className="text-small text-text-tertiary mt-4">
					Pay date: {new Date(`${data.pay_date}T00:00:00Z`).toLocaleDateString("en-MY")}
				</p>
			)}
		</WidgetCard>
	);
}
