import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useCan } from "@/lib/perm";
import { type RoleSummary, roleApi, userRolesApi } from "../api";

interface Props {
	userId: string;
	currentRoles: string[];
	/** Called after a successful save with the new role list. */
	onChange?: (roles: string[]) => void;
}

export function RolesCard({ userId, currentRoles, onChange }: Props) {
	const canEdit = useCan("role:write");
	const [roles, setRoles] = useState<RoleSummary[]>([]);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<Set<string>>(new Set(currentRoles));
	const [saving, setSaving] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	// Load the full role catalogue on mount so badge labels are resolved immediately.
	useEffect(() => {
		roleApi
			.list()
			.then(setRoles)
			.catch(() => {
				// silent — badges fall back to role codes if list fails
			});
	}, []);

	useEffect(() => {
		setDraft(new Set(currentRoles));
	}, [currentRoles]);

	const save = async () => {
		setSaving(true);
		setErr(null);
		try {
			const out = await userRolesApi.assign(userId, Array.from(draft));
			onChange?.(out.roles);
			setOpen(false);
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Failed to save");
		} finally {
			setSaving(false);
		}
	};

	const toggle = (code: string) => {
		const next = new Set(draft);
		if (next.has(code)) next.delete(code);
		else next.add(code);
		setDraft(next);
	};

	return (
		<section className="bg-surface rounded-lg p-4">
			<div className="flex items-center justify-between mb-3">
				<h2 className="text-h2 font-semibold">Roles</h2>
				{canEdit && (
					<Dialog open={open} onOpenChange={setOpen}>
						<DialogTrigger asChild>
							<Button variant="outline" size="sm">
								Edit roles
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Assign roles</DialogTitle>
							</DialogHeader>
							<ul className="space-y-2 py-2">
								{roles.map((r) => (
									<li key={r.code} className="flex items-center gap-3">
										<Checkbox
											id={`role-${r.code}`}
											checked={draft.has(r.code)}
											onCheckedChange={() => toggle(r.code)}
											aria-label={r.name}
										/>
										<label
											htmlFor={`role-${r.code}`}
											className="cursor-pointer"
										>
											{r.name}{" "}
											<code className="text-text-tertiary text-small">
												{r.code}
											</code>
										</label>
									</li>
								))}
							</ul>
							{err && <div className="text-error text-small">{err}</div>}
							<DialogFooter>
								<Button
									variant="ghost"
									onClick={() => setOpen(false)}
									disabled={saving}
								>
									Cancel
								</Button>
								<Button onClick={save} disabled={saving}>
									{saving ? "Saving…" : "Save"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				)}
			</div>
			{currentRoles.length === 0 ? (
				<span className="text-text-tertiary text-small">
					No roles assigned.
				</span>
			) : (
				<div className="flex flex-wrap gap-2">
					{currentRoles.map((code) => {
						const role = roles.find((r) => r.code === code);
						return (
							<span
								key={code}
								className="inline-flex items-center rounded-full bg-canvas border border-border-subtle px-2.5 py-1 text-small"
							>
								{role?.name ?? code}
							</span>
						);
					})}
				</div>
			)}
		</section>
	);
}
