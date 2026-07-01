import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import type { MeClaimable } from "../api";
import { md } from "./format";

export type ComposerMode = "create" | "edit" | "resubmit";

export interface ComposerInitial {
	project: string;
	projectName: string;
	mandays: string;
	note: string;
}

const TITLE: Record<ComposerMode, string> = {
	create: "Log a claim",
	edit: "Edit claim",
	resubmit: "Resubmit claim",
};
const CTA: Record<ComposerMode, string> = {
	create: "Submit claim",
	edit: "Save changes",
	resubmit: "Resubmit",
};

export function ClaimComposer({
	mode,
	claimable,
	initial,
	onClose,
	onSubmit,
}: {
	mode: ComposerMode;
	claimable: MeClaimable[];
	initial: ComposerInitial;
	onClose: () => void;
	onSubmit: (body: { project: string; mandays: string; note: string }) => Promise<void>;
}) {
	const [project, setProject] = useState(initial.project);
	const [mandays, setMandays] = useState(initial.mandays);
	const [note, setNote] = useState(initial.note);
	const [busy, setBusy] = useState(false);

	// If editing a claim whose project isn't in the open list, keep it selectable.
	const options = [...claimable];
	if (initial.project && !options.some((p) => p.id === initial.project)) {
		options.unshift({
			id: initial.project,
			name: initial.projectName || "Current project",
			customer_name: "",
			remaining: "0",
			deadline: null,
		});
	}

	async function submit() {
		if (!project || !mandays) {
			toast.error("Pick a project and enter mandays.");
			return;
		}
		setBusy(true);
		try {
			await onSubmit({ project, mandays, note });
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="glass-surface rounded-2xl p-4 space-y-3 border-accent-500/30">
			<div className="flex items-center justify-between">
				<p className="text-body font-semibold">{TITLE[mode]}</p>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close composer"
					className="text-text-tertiary hover:text-text-primary"
				>
					<X className="size-4" />
				</button>
			</div>
			<div className="grid gap-3 sm:grid-cols-[1fr_140px]">
				<select
					value={project}
					onChange={(e) => setProject(e.target.value)}
					aria-label="Project"
					className="bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body text-text-secondary"
				>
					<option value="">Select a project…</option>
					{options.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
							{Number(p.remaining) > 0 ? ` · ${md(p.remaining)} md left` : ""}
						</option>
					))}
				</select>
				<input
					type="number"
					min="0"
					step="0.25"
					value={mandays}
					onChange={(e) => setMandays(e.target.value)}
					placeholder="Mandays"
					aria-label="Mandays"
					className="bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body"
				/>
			</div>
			<input
				value={note}
				onChange={(e) => setNote(e.target.value)}
				placeholder="What did you do? (optional)"
				aria-label="Note"
				className="w-full bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body"
			/>
			<div className="flex justify-end gap-2">
				<Button type="button" variant="ghost" onClick={onClose}>
					Cancel
				</Button>
				<Button
					type="button"
					onClick={submit}
					disabled={busy}
					className="bg-accent-500 text-white"
				>
					{CTA[mode]}
				</Button>
			</div>
		</section>
	);
}
