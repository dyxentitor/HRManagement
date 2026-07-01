import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

import { type RoleSummary, roleApi } from "../api";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	role: RoleSummary;
	onSaved: () => void;
}

export function RenameRoleDialog({ open, onOpenChange, role, onSaved }: Props) {
	const [name, setName] = useState(role.name);
	const [description, setDescription] = useState(role.description ?? "");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	async function save() {
		if (!name.trim()) {
			setErr("Name is required.");
			return;
		}
		setBusy(true);
		setErr(null);
		try {
			await roleApi.rename(role.code, { name: name.trim(), description: description.trim() });
			toast.success("Role updated.");
			onSaved();
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Could not update the role.");
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
					<DialogTitle>Rename role</DialogTitle>
				</DialogHeader>
				<div className="space-y-3 py-2">
					<label className="block">
						<span className="text-small text-text-tertiary">Name</span>
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							aria-label="Role name"
							className={field}
						/>
					</label>
					<label className="block">
						<span className="text-small text-text-tertiary">Description</span>
						<input
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							aria-label="Role description"
							className={field}
						/>
					</label>
					{err && <p className="text-small text-coral">{err}</p>}
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
						Cancel
					</Button>
					<Button onClick={save} disabled={busy} className="bg-accent-500 text-white">
						{busy ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
