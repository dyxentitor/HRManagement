import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const STEPS = ["Submit", "Manager review", "Finance review", "Payment"];

export function HowClaimsWork() {
	return (
		<div className="bg-surface-hover border border-border-subtle rounded-xl p-4">
			<h3 className="text-label font-semibold text-text-secondary mb-4">How claims work</h3>
			<ol className="flex items-start">
				{STEPS.map((s, i) => (
					<li key={s} className="flex items-center flex-1 last:flex-none">
						<div className="flex flex-col items-center gap-1.5 min-w-[60px]">
							<span
								className={cn(
									"size-8 rounded-full grid place-items-center text-small font-bold border",
									i === 0
										? "bg-accent-500 border-accent-500 text-white"
										: "bg-transparent border-border-strong text-text-tertiary",
								)}
							>
								{i === 0 ? <Check className="size-4" aria-hidden /> : i + 1}
							</span>
							<span
								className={cn(
									"text-[10px] leading-tight text-center",
									i === 0 ? "text-text-primary font-semibold" : "text-text-tertiary",
								)}
							>
								{s}
							</span>
						</div>
						{i < STEPS.length - 1 && (
							<div className="h-0.5 flex-1 mx-1 -mt-5 bg-border-subtle" aria-hidden />
						)}
					</li>
				))}
			</ol>
			<p className="text-small text-text-tertiary mt-4">
				Typical turnaround is 3–7 working days. Attaching a receipt speeds up finance review.
			</p>
		</div>
	);
}
