import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import type { ClaimCategory } from "../api";
import { type Tone, categoryMeta } from "../lib/claim-ui";

const ICON_BG: Record<Tone, string> = {
	yellow: "bg-yellow/15 text-yellow",
	sky: "bg-sky/15 text-sky",
	lavender: "bg-lavender/15 text-lavender",
	mint: "bg-mint/15 text-mint",
	coral: "bg-coral/15 text-coral",
	peach: "bg-peach/15 text-peach",
};

export function ClaimCategoryGrid({
	categories,
}: {
	categories: ClaimCategory[];
}) {
	return (
		<div className="bg-surface-hover border border-border-subtle rounded-xl p-4">
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-label font-semibold text-text-secondary">
					Start a claim · pick a category
				</h3>
				<span className="text-small text-text-tertiary">{categories.length} types</span>
			</div>
			{categories.length === 0 ? (
				<p className="text-small text-text-tertiary">No claim categories configured.</p>
			) : (
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
					{categories.map((cat) => {
						const meta = categoryMeta(`${cat.code} ${cat.name}`);
						return (
							<Link
								key={cat.id}
								to={`/claims/submit?category=${cat.id}`}
								className="group rounded-xl border border-border-subtle p-3 flex flex-col gap-2 transition-transform duration-fast hover:-translate-y-0.5 hover:border-border-strong"
							>
								<span
									className={cn("size-9 rounded-xl grid place-items-center", ICON_BG[meta.tone])}
									aria-hidden
								>
									<meta.icon className="size-4.5" />
								</span>
								<span className="text-small text-text-primary font-medium leading-tight">
									{cat.name}
								</span>
								<span className="text-[10px] text-text-tertiary">
									{cat.requires_attachment ? "Receipt required" : "No receipt needed"}
								</span>
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}
