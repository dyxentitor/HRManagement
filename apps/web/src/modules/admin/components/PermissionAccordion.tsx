import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import type { CatalogueModule, CataloguePermission } from "../api";

interface Props {
	modules: CatalogueModule[];
	/** Codes currently granted in the working draft. */
	draft: Set<string>;
	editable: boolean;
	/** Codes the user may NOT toggle (protected floor); shown disabled with a reason. */
	lockedReason?: (code: string) => string | null;
	onToggle: (code: string, next: boolean) => void;
	search: string;
	grantedOnly: boolean;
}

const SCOPE_STYLE: Record<string, string> = {
	org: "bg-coral/15 text-coral",
	team: "bg-yellow/15 text-yellow",
	self: "bg-mint/15 text-mint",
};

function matches(p: CataloguePermission, q: string): boolean {
	if (!q) return true;
	const t = q.toLowerCase();
	return (
		p.label.toLowerCase().includes(t) ||
		p.code.toLowerCase().includes(t) ||
		p.description.toLowerCase().includes(t)
	);
}

export function PermissionAccordion({
	modules,
	draft,
	editable,
	lockedReason,
	onToggle,
	search,
	grantedOnly,
}: Props) {
	const [open, setOpen] = useState<Set<string>>(new Set());

	const visible = useMemo(() => {
		return modules
			.map((m) => ({
				...m,
				permissions: m.permissions.filter(
					(p) => matches(p, search) && (!grantedOnly || draft.has(p.code)),
				),
			}))
			.filter((m) => m.permissions.length > 0);
	}, [modules, search, grantedOnly, draft]);

	if (visible.length === 0) {
		return <p className="text-small text-text-tertiary px-1 py-6">No permissions match.</p>;
	}

	function toggleOpen(key: string) {
		setOpen((prev) => {
			const next = new Set(prev);
			next.has(key) ? next.delete(key) : next.add(key);
			return next;
		});
	}

	function toggleModule(m: (typeof visible)[number], grantAll: boolean) {
		for (const p of m.permissions) {
			if (lockedReason?.(p.code)) continue;
			if (draft.has(p.code) !== grantAll) onToggle(p.code, grantAll);
		}
	}

	return (
		<div className="space-y-2">
			{visible.map((m) => {
				const grantedHere = m.permissions.filter((p) => draft.has(p.code)).length;
				const all = grantedHere === m.permissions.length;
				const some = grantedHere > 0 && !all;
				const isOpen = open.has(m.key) || !!search;
				return (
					<div key={m.key} className="rounded-xl border border-border-subtle bg-white/[0.03]">
						<div className="flex items-center gap-3 px-3 py-2.5">
							<button
								type="button"
								onClick={() => toggleOpen(m.key)}
								className="flex flex-1 items-center gap-2 text-left"
								aria-expanded={isOpen}
							>
								<ChevronRight
									className={cn(
										"size-4 text-text-tertiary transition-transform",
										isOpen && "rotate-90",
									)}
								/>
								<span className="text-body font-medium text-text-primary">{m.label}</span>
								<span className="text-small text-text-tertiary">
									{grantedHere} of {m.permissions.length}
								</span>
							</button>
							<input
								type="checkbox"
								aria-label={`Toggle all ${m.label}`}
								checked={all}
								ref={(el) => {
									if (el) el.indeterminate = some;
								}}
								disabled={!editable}
								onChange={(e) => toggleModule(m, e.target.checked)}
								className="size-4 accent-accent-500"
							/>
						</div>
						{isOpen && (
							<div className="border-t border-border-subtle">
								{m.permissions.map((p) => {
									const locked = lockedReason?.(p.code) ?? null;
									const checked = draft.has(p.code);
									return (
										<label
											key={p.code}
											title={locked ?? undefined}
											className={cn(
												"flex items-start gap-3 px-4 py-2 border-b border-white/5 last:border-b-0",
												!locked && editable && "cursor-pointer hover:bg-white/[0.02]",
											)}
										>
											<input
												type="checkbox"
												checked={checked}
												disabled={!editable || !!locked}
												onChange={(e) => onToggle(p.code, e.target.checked)}
												className="mt-0.5 size-4 accent-accent-500"
											/>
											<span className="flex-1 min-w-0">
												<span className="flex items-center gap-2">
													<span className="text-small text-text-primary">{p.label}</span>
													{p.dangerous && (
														<span className="text-[10px] font-semibold text-coral">
															● sensitive
														</span>
													)}
												</span>
												{p.description && (
													<span className="block text-small text-text-tertiary">
														{p.description}
													</span>
												)}
												<span className="block font-mono text-[10px] text-text-tertiary/70">
													{p.code}
												</span>
											</span>
											{p.scope && (
												<span
													className={cn(
														"text-[10px] font-semibold px-2 py-0.5 rounded-full self-start",
														SCOPE_STYLE[p.scope],
													)}
												>
													{p.scope}
												</span>
											)}
										</label>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
