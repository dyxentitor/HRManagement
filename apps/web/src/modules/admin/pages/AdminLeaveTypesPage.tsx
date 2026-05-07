import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCan } from "@/lib/perm";

import { LeaveTypeCarryForwardTab } from "../components/LeaveTypeCarryForwardTab";
import { LeaveTypeGeneralTab } from "../components/LeaveTypeGeneralTab";
import { LeaveTypeTenureTiersTab } from "../components/LeaveTypeTenureTiersTab";
import { type LeaveType, leaveTypeApi } from "../leave-types-api";

export default function AdminLeaveTypesPage() {
	const canWrite = useCan("leave:type:write");
	const [types, setTypes] = useState<LeaveType[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [draft, setDraft] = useState<LeaveType | null>(null);
	const [tab, setTab] = useState("general");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(() => {
		leaveTypeApi
			.list()
			.then((rows) => {
				setTypes(rows);
				setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
			})
			.catch(() => setError("Could not load leave types"));
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	useEffect(() => {
		const sel = types.find((t) => t.id === selectedId) ?? null;
		setDraft(sel ? { ...sel } : null);
	}, [selectedId, types]);

	if (!canWrite) {
		return (
			<div className="p-6">
				<PageHeader title="Leave types" />
				<p className="text-muted-foreground">
					You don't have permission to manage leave types.
				</p>
			</div>
		);
	}

	const save = async () => {
		if (!draft) return;
		setSaving(true);
		setError(null);
		try {
			await leaveTypeApi.update(draft.id, draft);
			refresh();
		} catch {
			setError("Save failed");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="grid grid-cols-[280px_1fr] gap-4 p-6">
			<div className="flex flex-col gap-2">
				<PageHeader title="Leave types" />
				{error && <p className="text-sm text-red-500">{error}</p>}
				<div className="flex flex-col rounded-lg border border-border/50">
					{types.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => setSelectedId(t.id)}
							className={`px-3 py-2 text-left text-sm transition-colors hover:bg-violet-500/5 ${
								selectedId === t.id ? "bg-violet-500/10" : ""
							}`}
						>
							<div className="font-medium">{t.code}</div>
							<div className="text-xs text-muted-foreground">{t.name}</div>
						</button>
					))}
					{types.length === 0 ? (
						<div className="p-3 text-sm text-muted-foreground">
							No leave types configured.
						</div>
					) : null}
				</div>
			</div>

			{draft ? (
				<div className="flex flex-col gap-4">
					<Tabs value={tab} onValueChange={setTab}>
						<TabsList>
							<TabsTrigger value="general">General</TabsTrigger>
							<TabsTrigger value="tenure">Tenure tiers</TabsTrigger>
							<TabsTrigger value="carry">Carry-forward</TabsTrigger>
						</TabsList>
						<TabsContent value="general">
							<LeaveTypeGeneralTab value={draft} onChange={setDraft} />
						</TabsContent>
						<TabsContent value="tenure">
							<LeaveTypeTenureTiersTab leaveTypeId={draft.id} />
						</TabsContent>
						<TabsContent value="carry">
							<LeaveTypeCarryForwardTab
								value={{
									carry_forward_max: draft.carry_forward_max,
									carry_forward_expiry_months:
										draft.carry_forward_expiry_months,
								}}
								onChange={(v) =>
									setDraft({
										...draft,
										carry_forward_max: v.carry_forward_max,
										carry_forward_expiry_months: v.carry_forward_expiry_months,
									})
								}
							/>
						</TabsContent>
					</Tabs>
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							onClick={() => {
								const sel = types.find((t) => t.id === selectedId) ?? null;
								setDraft(sel ? { ...sel } : null);
							}}
						>
							Cancel
						</Button>
						<Button type="button" disabled={saving} onClick={save}>
							{saving ? "Saving..." : "Save"}
						</Button>
					</div>
				</div>
			) : (
				<div className="text-muted-foreground">Select a leave type.</div>
			)}
		</div>
	);
}
