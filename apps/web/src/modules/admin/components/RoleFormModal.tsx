import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

import { type RoleDetail, type RoleSummary, roleApi } from "../api";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	roles: RoleSummary[];
	/** "clone" pre-selects clone mode (e.g. opened from a role's ⋯ Clone). */
	initialMode?: "empty" | "clone";
	initialSource?: string;
	onCreated: (role: RoleDetail) => void;
}

export function RoleFormModal({
	open,
	onOpenChange,
	roles,
	initialMode = "empty",
	initialSource,
	onCreated,
}: Props) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [from, setFrom] = useState<"empty" | "clone">(initialMode);
	const [source, setSource] = useState(initialSource ?? roles[0]?.code ?? "");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	// Reset the form each time the modal opens.
	useEffect(() => {
		if (open) {
			setName("");
			setDescription("");
			setFrom(initialMode);
			setSource(initialSource ?? roles[0]?.code ?? "");
			setErr(null);
		}
	}, [open, initialMode, initialSource, roles]);

	async function submit() {
		if (!name.trim()) {
			setErr("Name is required.");
			return;
		}
		setBusy(true);
		setErr(null);
		try {
			const role =
				from === "clone" && source
					? await roleApi.clone(source, name.trim(), description.trim())
					: await roleApi.create(name.trim(), description.trim());
			onCreated(role);
			onOpenChange(false);
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Could not create the role.");
		} finally {
			setBusy(false);
		}
	}

	const field =
		"w-full bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body focus:outline-none focus:border-accent-500/50";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New role</DialogTitle>
				</DialogHeader>
				<div className="space-y-3 py-2">
					<label className="block">
						<span className="text-small text-text-tertiary">Name</span>
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Payroll Auditor"
							aria-label="Role name"
							className={field}
							autoFocus
						/>
					</label>
					<label className="block">
						<span className="text-small text-text-tertiary">Description (optional)</span>
						<input
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="What this role is for"
							aria-label="Role description"
							className={field}
						/>
					</label>
					<fieldset className="space-y-2">
						<span className="text-small text-text-tertiary">Start from</span>
						<label className="flex items-center gap-2 text-small text-text-secondary">
							<input
								type="radio"
								name="start-from"
								checked={from === "empty"}
								onChange={() => setFrom("empty")}
								className="accent-accent-500"
							/>
							Empty role (no permissions)
						</label>
						<div className="flex items-center gap-2">
							<label className="flex items-center gap-2 text-small text-text-secondary">
								<input
									type="radio"
									name="start-from"
									checked={from === "clone"}
									onChange={() => setFrom("clone")}
									className="accent-accent-500"
								/>
								Clone an existing role
							</label>
							<select
								value={source}
								onChange={(e) => {
									setSource(e.target.value);
									setFrom("clone");
								}}
								disabled={from !== "clone"}
								aria-label="Role to clone"
								className="flex-1 bg-canvas border border-border-subtle rounded-md px-2 py-1 text-small text-text-secondary disabled:opacity-50"
							>
								{roles.map((r) => (
									<option key={r.code} value={r.code}>
										{r.name}
									</option>
								))}
							</select>
						</div>
					</fieldset>
					{err && <p className="text-small text-coral">{err}</p>}
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
						Cancel
					</Button>
					<Button onClick={submit} disabled={busy} className="bg-accent-500 text-white">
						{busy ? "Creating…" : "Create role"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
