import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import type { ClaimCategory } from "../api";
import { type Tone, categoryCopy, categoryMeta } from "../lib/claim-ui";

const ICON_BG: Record<Tone, string> = {
	yellow: "bg-yellow/15 text-yellow",
	sky: "bg-sky/15 text-sky",
	lavender: "bg-lavender/15 text-lavender",
	mint: "bg-mint/15 text-mint",
	coral: "bg-coral/15 text-coral",
	peach: "bg-peach/15 text-peach",
};

/** Large glass feature cards that explain each category and launch the form. */
export function ClaimCategoryGrid({ categories }: { categories: ClaimCategory[] }) {
	return (
		<section>
			<p className="layer-eyebrow mb-3">Start a new claim</p>
			{categories.length === 0 ? (
				<p className="text-small text-text-tertiary">No claim categories configured.</p>
			) : (
				<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
					{categories.map((cat) => {
						const meta = categoryMeta(`${cat.code} ${cat.name}`);
						return (
							<Link
								key={cat.id}
								to={`/claims/submit?category=${cat.id}`}
								className="group glass-surface rounded-2xl p-5 flex flex-col gap-3 transition-transform duration-fast hover:-translate-y-1 focus-visible:-translate-y-1"
							>
								<span
									className={cn("size-11 rounded-2xl grid place-items-center", ICON_BG[meta.tone])}
									aria-hidden
								>
									<meta.icon className="size-5" />
								</span>
								<h3 className="text-h3 text-text-primary">{cat.name}</h3>
								<p className="text-small text-text-tertiary leading-relaxed flex-1">
									{categoryCopy(`${cat.code} ${cat.name}`, cat.requires_attachment)}
								</p>
								<span className="text-small text-accent-200 inline-flex items-center gap-1 group-hover:gap-2 transition-all duration-fast">
									Start <ArrowRight className="size-3.5" />
								</span>
							</Link>
						);
					})}
				</div>
			)}
		</section>
	);
}
