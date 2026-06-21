import { Button } from "@/components/ui/button";
import type { StepCtx } from "./types";

export function WelcomeStep({ ctx }: { ctx: StepCtx }) {
	const org = ctx.preview?.org_name ?? "Provintell";
	const name = ctx.preview?.full_name?.split(" ")[0] ?? "there";
	return (
		<div className="flex flex-col items-start justify-center h-full">
			<div className="text-5xl mb-3">👋</div>
			<p className="layer-eyebrow text-accent-200">Welcome aboard</p>
			<h2 className="text-h1 text-text-primary mt-1">
				Hi {name}, welcome to {org}
			</h2>
			<p className="text-body text-text-secondary mt-2 max-w-md">
				We're excited to have you on the team. Let's get your workspace set up — it takes about 3
				minutes, and we'll save your progress as you go.
			</p>
			<Button className="mt-7 soft-glow" onClick={ctx.goNext}>
				Let's get started →
			</Button>
		</div>
	);
}
