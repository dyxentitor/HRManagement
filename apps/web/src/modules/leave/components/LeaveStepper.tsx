import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LeaveRequestStatus } from "../api";
import { LEAVE_STAGES, stageStates } from "../lib/leave-ui";

/** Compact 3-stage journey for a leave request (Submitted → In review → Approved). */
export function LeaveStepper({ status }: { status: LeaveRequestStatus }) {
	const states = stageStates(status);
	const rejected = status === "rejected";
	return (
		<ol className="flex items-start">
			{LEAVE_STAGES.map((label, i) => {
				const state = states[i];
				return (
					<li key={label} className="flex items-center flex-1 last:flex-none">
						<div className="flex flex-col items-center gap-1.5">
							<span
								className={cn(
									"size-6 rounded-full grid place-items-center text-[10px] font-bold border",
									state === "done" && "bg-mint/20 border-mint text-mint",
									state === "current" &&
										!rejected &&
										"bg-accent-500 border-accent-500 text-white soft-glow",
									state === "current" && rejected && "bg-coral/20 border-coral text-coral",
									state === "upcoming" && "bg-transparent border-border-strong text-text-tertiary",
								)}
							>
								{state === "done" ? <Check className="size-3" aria-hidden /> : i + 1}
							</span>
							<span
								className={cn(
									"text-[9px] leading-none text-center",
									state === "current" ? "text-text-primary font-semibold" : "text-text-tertiary",
								)}
							>
								{label}
							</span>
						</div>
						{i < LEAVE_STAGES.length - 1 && (
							<div
								className={cn(
									"h-0.5 flex-1 mx-1 -mt-4",
									state === "done" ? "bg-mint/50" : "bg-border-subtle",
								)}
								aria-hidden
							/>
						)}
					</li>
				);
			})}
		</ol>
	);
}
