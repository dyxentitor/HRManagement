import { Button } from "@/components/ui/button";
import type { StepCtx } from "./types";

export function ReadyStep({ ctx }: { ctx: StepCtx }) {
	return (
		<div className="flex flex-col items-center justify-center h-full text-center">
			<div className="text-5xl mb-3">🎉</div>
			<h2 className="text-h1 text-text-primary">You're all set!</h2>
			<p className="text-body text-text-secondary mt-2 max-w-md">
				Your workspace is ready. You can now view your dashboard, submit leave, see your payroll,
				and finish any remaining onboarding tasks.
			</p>
			<Button className="mt-7 soft-glow" onClick={ctx.finish}>
				Go to my dashboard →
			</Button>
		</div>
	);
}
