import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { type Employee, employeeApi } from "@/modules/employee/api";

import { type RoleMember, roleMembersApi } from "../api";

interface Props {
	roleCode: string;
	members: RoleMember[];
	canWrite: boolean;
	onChange: (members: RoleMember[]) => void;
}

export function RoleMembersTab({ roleCode, members, canWrite, onChange }: Props) {
	const [candidates, setCandidates] = useState<Employee[]>([]);
	const [query, setQuery] = useState("");
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!canWrite) return;
		void employeeApi
			.list()
			.then((rows) => setCandidates(rows.filter((e) => e.user_id)))
			.catch(() => setCandidates([]));
	}, [canWrite]);

	const memberUserIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);

	const matches = useMemo(() => {
		if (!query) return [];
		const q = query.toLowerCase();
		return candidates
			.filter((e) => e.user_id && !memberUserIds.has(e.user_id))
			.filter((e) => e.full_name.toLowerCase().includes(q))
			.slice(0, 8);
	}, [query, candidates, memberUserIds]);

	async function addPicked() {
		if (picked.size === 0) return;
		setBusy(true);
		try {
			const updated = await roleMembersApi.add(roleCode, [...picked]);
			onChange(updated);
			setPicked(new Set());
			setQuery("");
			toast.success(`Added ${picked.size} member${picked.size > 1 ? "s" : ""}.`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not add members.");
		} finally {
			setBusy(false);
		}
	}

	async function remove(m: RoleMember) {
		try {
			const updated = await roleMembersApi.remove(roleCode, m.user_id);
			onChange(updated);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not remove member.");
		}
	}

	function togglePick(userId: string) {
		setPicked((prev) => {
			const n = new Set(prev);
			if (n.has(userId)) n.delete(userId);
			else n.add(userId);
			return n;
		});
	}

	return (
		<div className="p-4 space-y-4">
			{canWrite && (
				<div className="space-y-2">
					<div className="flex items-center gap-2 bg-canvas border border-border-subtle rounded-md px-3 py-1.5">
						<Search className="size-3.5 text-text-tertiary" />
						<input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search employees to add…"
							aria-label="Search employees to add"
							className="bg-transparent text-small w-full focus:outline-none"
						/>
						{picked.size > 0 && (
							<Button
								type="button"
								size="sm"
								onClick={addPicked}
								disabled={busy}
								className="bg-accent-500 text-white"
							>
								Add {picked.size}
							</Button>
						)}
					</div>
					{matches.length > 0 && (
						<div className="rounded-lg border border-border-subtle divide-y divide-white/5">
							{matches.map((e) => (
								<label
									key={e.user_id}
									className="flex items-center gap-2 px-3 py-1.5 text-small cursor-pointer hover:bg-white/[0.02]"
								>
									<input
										type="checkbox"
										checked={!!e.user_id && picked.has(e.user_id)}
										onChange={() => e.user_id && togglePick(e.user_id)}
										className="size-3.5 accent-accent-500"
									/>
									<span className="text-text-secondary">{e.full_name}</span>
								</label>
							))}
						</div>
					)}
				</div>
			)}

			{members.length === 0 ? (
				<p className="text-small text-text-tertiary py-4">No one has this role yet.</p>
			) : (
				<div className="space-y-1.5">
					{members.map((m) => (
						<div
							key={m.user_id}
							className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2"
						>
							<div className="min-w-0">
								<p className="text-small text-text-primary truncate">{m.name}</p>
								{m.email && <p className="text-[10px] text-text-tertiary truncate">{m.email}</p>}
							</div>
							{canWrite && (
								<button
									type="button"
									aria-label={`Remove ${m.name}`}
									onClick={() => remove(m)}
									className="text-text-tertiary hover:text-coral"
								>
									<X className="size-4" />
								</button>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
