import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { type Department, settingsApi, unwrapResults } from "./settings-api";

type Modal =
	| { kind: "closed" }
	| { kind: "create" }
	| { kind: "edit"; dept: Department };

interface TreeNode extends Department {
	children: TreeNode[];
	depth: number;
}

export default function DepartmentsAdminPage() {
	const [depts, setDepts] = useState<Department[]>([]);
	const [modal, setModal] = useState<Modal>({ kind: "closed" });
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const body = await settingsApi.listDepartments();
			setDepts(unwrapResults(body));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh().catch(() => undefined);
	}, [refresh]);

	const tree = useMemo(() => buildTree(depts), [depts]);

	async function onDelete(d: Department) {
		if (!window.confirm(`Delete department "${d.name}"?`)) return;
		setError(null);
		try {
			await settingsApi.deleteDepartment(d.id);
			await refresh();
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Delete failed");
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title="Departments"
				subtitle={
					loading
						? "Loading…"
						: `${depts.length} department${depts.length === 1 ? "" : "s"}`
				}
				actions={
					<Button type="button" onClick={() => setModal({ kind: "create" })}>
						<Plus className="size-4 mr-1" /> New Department
					</Button>
				}
			/>

			{error && (
				<div
					role="alert"
					className="rounded-lg border border-coral/30 bg-coral/10 text-coral text-small p-3"
				>
					{error}
				</div>
			)}

			<div className="rounded-lg border border-border-subtle bg-surface overflow-hidden">
				{depts.length === 0 && !loading ? (
					<div className="p-4 text-small text-text-tertiary">
						No departments yet.
					</div>
				) : (
					tree.map((node) => (
						<DeptRow
							key={node.id}
							node={node}
							onEdit={(d) => setModal({ kind: "edit", dept: d })}
							onDelete={onDelete}
						/>
					))
				)}
			</div>

			{(modal.kind === "create" || modal.kind === "edit") && (
				<DeptModal
					modal={modal}
					allDepts={depts}
					onCancel={() => setModal({ kind: "closed" })}
					onSaved={async () => {
						setModal({ kind: "closed" });
						await refresh();
					}}
				/>
			)}
		</div>
	);
}

function buildTree(rows: Department[]): TreeNode[] {
	const byId: Record<string, TreeNode> = {};
	for (const r of rows) {
		byId[r.id] = { ...r, children: [], depth: 0 };
	}
	const roots: TreeNode[] = [];
	for (const r of rows) {
		if (r.parent && byId[r.parent]) {
			byId[r.parent].children.push(byId[r.id]);
		} else {
			roots.push(byId[r.id]);
		}
	}
	function assignDepth(nodes: TreeNode[], depth: number) {
		for (const n of nodes) {
			n.depth = depth;
			assignDepth(n.children, depth + 1);
		}
	}
	assignDepth(roots, 0);
	return roots;
}

function DeptRow({
	node,
	onEdit,
	onDelete,
}: {
	node: TreeNode;
	onEdit: (d: Department) => void;
	onDelete: (d: Department) => void;
}) {
	return (
		<>
			<div
				data-row="department"
				className="flex items-center justify-between p-3 border-b border-border-subtle last:border-b-0"
				style={{ paddingLeft: `${12 + node.depth * 24}px` }}
			>
				<div className="text-body text-text-primary">{node.name}</div>
				<div className="flex gap-1">
					<button
						type="button"
						aria-label={`Edit ${node.name}`}
						onClick={() => onEdit(node)}
						className="p-1.5 rounded hover:bg-surface-hover text-accent-200"
					>
						<Pencil className="size-3.5" />
					</button>
					<button
						type="button"
						aria-label={`Delete ${node.name}`}
						onClick={() => onDelete(node)}
						className="p-1.5 rounded hover:bg-surface-hover text-coral"
					>
						<Trash2 className="size-3.5" />
					</button>
				</div>
			</div>
			{node.children.map((c) => (
				<DeptRow key={c.id} node={c} onEdit={onEdit} onDelete={onDelete} />
			))}
		</>
	);
}

function DeptModal({
	modal,
	allDepts,
	onCancel,
	onSaved,
}: {
	modal: { kind: "create" } | { kind: "edit"; dept: Department };
	allDepts: Department[];
	onCancel: () => void;
	onSaved: () => void | Promise<void>;
}) {
	const editing = modal.kind === "edit" ? modal.dept : null;
	const [name, setName] = useState(editing?.name ?? "");
	const [parent, setParent] = useState<string>(editing?.parent ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function submit() {
		setBusy(true);
		setError(null);
		try {
			const payload = { name, parent: parent || null };
			if (editing) {
				await settingsApi.updateDepartment(editing.id, payload);
			} else {
				await settingsApi.createDepartment(payload);
			}
			await onSaved();
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Save failed");
		} finally {
			setBusy(false);
		}
	}

	const parentOptions = allDepts.filter((d) => !editing || d.id !== editing.id);

	return (
		<Dialog open onOpenChange={onCancel}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{editing ? "Edit Department" : "New Department"}
					</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3 py-2">
					<div className="block">
						<label
							htmlFor="dept-name"
							className="text-label uppercase text-text-tertiary block mb-1"
						>
							Name
						</label>
						<Input
							id="dept-name"
							aria-label="Name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="block">
						<label
							htmlFor="dept-parent"
							className="text-label uppercase text-text-tertiary block mb-1"
						>
							Parent department
						</label>
						<select
							id="dept-parent"
							aria-label="Parent department"
							className="w-full bg-canvas border border-border-subtle rounded px-2 py-1.5 text-body"
							value={parent}
							onChange={(e) => setParent(e.target.value)}
						>
							<option value="">— (top level)</option>
							{parentOptions.map((d) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>
					</div>
					{error && <div className="text-coral text-small">{error}</div>}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={onCancel}
						disabled={busy}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={submit}
						disabled={busy || !name.trim()}
					>
						{busy ? "Saving…" : editing ? "Save" : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
