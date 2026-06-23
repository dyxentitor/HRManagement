import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DetailPanel } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { type Employee, employeeApi } from "@/modules/employee/api";
import { type AssignmentType, assignmentsApi } from "../api";

const SELECT = "bg-canvas border border-border-subtle rounded px-2 py-1.5 text-small w-full";

type Kind = "org" | "employee" | "team_scope";

export function CreateAssignmentDrawer({
	open,
	onClose,
	onCreated,
	managerScoped,
}: {
	open: boolean;
	onClose: () => void;
	onCreated: () => void;
	/** Manager (create:team only) — locked to their direct reports. */
	managerScoped: boolean;
}) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [type, setType] = useState<AssignmentType>("task");
	const [linkUrl, setLinkUrl] = useState("");
	const [due, setDue] = useState("");
	const [kind, setKind] = useState<Kind>(managerScoped ? "team_scope" : "org");
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [picked, setPicked] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (open && !managerScoped)
			employeeApi
				.list()
				.then(setEmployees)
				.catch(() => setEmployees([]));
	}, [open, managerScoped]);

	async function submit() {
		if (!title.trim()) {
			toast.error("A title is required.");
			return;
		}
		if (kind === "employee" && picked.length === 0) {
			toast.error("Pick at least one employee.");
			return;
		}
		// manager "team_scope" sends kind:org — the backend intersects with their direct reports.
		const target =
			kind === "employee"
				? { kind: "employee" as const, ids: picked }
				: { kind: "org" as const, ids: [] };
		setBusy(true);
		try {
			await assignmentsApi.create({
				title: title.trim(),
				description: description.trim(),
				type,
				link_url: linkUrl.trim(),
				link_target: linkUrl.trim() ? (linkUrl.startsWith("/") ? "internal" : "external") : "none",
				default_due_date: due || null,
				target,
			});
			toast.success("Assignment published");
			onCreated();
			onClose();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not create assignment");
		} finally {
			setBusy(false);
		}
	}

	return (
		<DetailPanel open={open} onClose={onClose} title="New assignment">
			<div className="space-y-3">
				<Field label="Title">
					<Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
				</Field>
				<Field label="Description (optional)">
					<Input
						aria-label="Description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</Field>
				<div className="grid grid-cols-2 gap-3">
					<Field label="Type">
						<select
							aria-label="Type"
							className={SELECT}
							value={type}
							onChange={(e) => setType(e.target.value as AssignmentType)}
						>
							<option value="task">Task</option>
							<option value="acknowledge">Acknowledge (read &amp; accept)</option>
						</select>
					</Field>
					<Field label="Due date (optional)">
						<Input
							aria-label="Due date"
							type="date"
							value={due}
							onChange={(e) => setDue(e.target.value)}
						/>
					</Field>
				</div>
				<Field label="Link (internal route or external URL, optional)">
					<Input
						aria-label="Link"
						placeholder="/me/profile  ·  https://forms.gle/…"
						value={linkUrl}
						onChange={(e) => setLinkUrl(e.target.value)}
					/>
				</Field>

				<Field label="Assign to">
					{managerScoped ? (
						<p className="text-small text-text-secondary glass-surface rounded-lg px-3 py-2">
							Your direct reports
						</p>
					) : (
						<select
							aria-label="Assign to"
							className={SELECT}
							value={kind}
							onChange={(e) => setKind(e.target.value as Kind)}
						>
							<option value="org">Everyone in the org</option>
							<option value="employee">Specific employees</option>
						</select>
					)}
				</Field>

				{kind === "employee" && !managerScoped && (
					<select
						aria-label="Employees"
						multiple
						className={`${SELECT} h-40`}
						value={picked}
						onChange={(e) => setPicked(Array.from(e.target.selectedOptions, (o) => o.value))}
					>
						{employees.map((emp) => (
							<option key={emp.id} value={emp.id}>
								{emp.full_name}
							</option>
						))}
					</select>
				)}

				<Button onClick={submit} disabled={busy} className="soft-glow rounded-xl w-full">
					Publish assignment
				</Button>
			</div>
		</DetailPanel>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</span>
			{children}
		</label>
	);
}
