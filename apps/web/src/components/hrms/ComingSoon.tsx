import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

export interface ComingSoonProps {
	eyebrow?: string;
	title?: string;
	message?: string;
	/** A short "what's coming" teaser list. */
	highlights?: string[];
}

/** A premium full-page placeholder for features that are being reworked. */
export function ComingSoon({
	eyebrow = "In the works",
	title = "Coming soon",
	message = "We're reworking this feature into something better. It'll be back shortly.",
	highlights = [],
}: ComingSoonProps) {
	const navigate = useNavigate();
	return (
		<div className="grid place-items-center min-h-[calc(100vh-8rem)] px-4">
			<div
				className="relative overflow-hidden rounded-3xl border border-border-subtle p-10 sm:p-14 max-w-xl w-full text-center"
				style={{
					background:
						"radial-gradient(620px 280px at 50% -10%, rgb(124 92 255 / 0.28), transparent 60%), radial-gradient(420px 240px at 100% 120%, rgb(151 217 199 / 0.12), transparent 60%), linear-gradient(160deg, #181126, #110e1f 60%, #0c1018)",
				}}
			>
				<div className="relative z-10 flex flex-col items-center">
					<span className="size-14 rounded-2xl grid place-items-center bg-accent-500/15 text-accent-200 soft-glow">
						<Sparkles className="size-7" />
					</span>
					<p className="layer-eyebrow text-accent-200 mt-5">{eyebrow}</p>
					<h1 className="text-3xl font-extralight tracking-tight mt-1">{title}</h1>
					<p className="text-body text-text-secondary mt-3 max-w-md">{message}</p>

					{highlights.length > 0 && (
						<ul className="mt-6 grid gap-2 text-left w-full max-w-xs">
							{highlights.map((h) => (
								<li
									key={h}
									className="flex items-center gap-2.5 text-small text-text-secondary glass-surface rounded-xl px-3 py-2"
								>
									<span className="size-1.5 rounded-full bg-accent-300 shrink-0" />
									{h}
								</li>
							))}
						</ul>
					)}

					<Button className="mt-8 soft-glow rounded-xl" onClick={() => navigate("/")}>
						Back to dashboard
					</Button>
				</div>
			</div>
		</div>
	);
}
