import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { type EffectiveAccess, type EffectiveAccessPermission, userAccessApi } from "../api";

interface Props {
	userId: string;
	name: string;
	onClose: () => void;
}

const SCOPE_STYLE: Record<string, string> = {
	org: "bg-coral/15 text-coral",
	team: "bg-yellow/15 text-yellow",
	self: "bg-mint/15 text-mint",
};

type GroupBy = "module" | "role";
type RowPerm = EffectiveAccessPermission & { alsoVia?: string };

function matches(p: EffectiveAccessPermission, q: string): boolean {
	if (!q) return true;
	const t = q.toLowerCase();
	return p.label.toLowerCase().includes(t) || p.code.toLowerCase().includes(t);
}

/** Read-only row used in both grouping modes. */
function PermRow({ p, showSource }: { p: RowPerm; showSource: boolean }) {
	return (
		<div className={cn("flex items-start gap-2 px-3 py-2", p.alsoVia && "opacity-50")}>
			<span className="flex-1 min-w-0">
				<span className="flex items-center gap-2">
					<span className="text-small text-text-primary">{p.label}</span>
					{p.dangerous && <span className="text-[10px] font-semibold text-coral">● sensitive</span>}
				</span>
				{showSource && (
					<span className="block text-[10px] text-text-tertiary">via {p.sources.join(", ")}</span>
				)}
				{p.alsoVia && (
					<span className="block text-[10px] text-text-tertiary">also via {p.alsoVia}</span>
				)}
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
		</div>
	);
}

export function EffectiveAccessDrawer({ userId, name, onClose }: Props) {
	const [data, setData] = useState<EffectiveAccess | null>(null);
	const [loading, setLoading] = useState(true);
	const [groupBy, setGroupBy] = useState<GroupBy>("module");
	const [search, setSearch] = useState("");

	useEffect(() => {
		setLoading(true);
		userAccessApi
			.effective(userId)
			.then(setData)
			.catch(() => setData(null))
			.finally(() => setLoading(false));
	}, [userId]);

	const totalPerms = data?.modules.reduce((n, m) => n + m.permissions.length, 0) ?? 0;

	// Module mode: filtered modules. Role mode: each role's perms, duplicates flagged with `alsoVia`.
	const moduleGroups = useMemo(
		() =>
			(data?.modules ?? [])
				.map((m) => ({ ...m, permissions: m.permissions.filter((p) => matches(p, search)) }))
				.filter((m) => m.permissions.length > 0),
		[data, search],
	);
	const roleGroups = useMemo(() => {
		if (!data) return [];
		const all = data.modules.flatMap((m) => m.permissions).filter((p) => matches(p, search));
		const firstBy = new Map<string, string>();
		return data.roles
			.map((role) => {
				const perms: RowPerm[] = all
					.filter((p) => p.sources.includes(role.code))
					.map((p) => {
						const first = firstBy.get(p.code);
						if (first === undefined) firstBy.set(p.code, role.name);
						return { ...p, alsoVia: first };
					});
				return { role, perms };
			})
			.filter((g) => g.perms.length > 0);
	}, [data, search]);

	return (
		<Sheet open onOpenChange={(o) => !o && onClose()}>
			<SheetContent side="right" className="w-[440px] max-w-full p-0 overflow-y-auto">
				<SheetHeader className="p-4 border-b border-border-subtle text-left space-y-0">
					<p className="text-label text-text-tertiary">Effective access</p>
					<SheetTitle className="text-h3 text-text-primary">{name}</SheetTitle>
					<SheetDescription asChild>
						<div className="mt-2 flex flex-wrap items-center gap-1.5">
							{data?.roles.map((r) => (
								<span
									key={r.code}
									className="text-[10px] rounded-full bg-accent-500/15 text-accent-200 px-2 py-0.5"
								>
									{r.name}
								</span>
							))}
							<span className="text-[10px] text-text-tertiary px-1">{totalPerms} permissions</span>
						</div>
					</SheetDescription>
					<div className="flex items-center gap-2 pt-3">
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search permissions…"
							aria-label="Search permissions"
							className="flex-1 bg-canvas border border-border-subtle rounded-md px-3 py-1.5 text-small focus:outline-none"
						/>
						<div className="inline-flex rounded-md border border-border-subtle overflow-hidden text-[11px]">
							{(["module", "role"] as const).map((g) => (
								<button
									key={g}
									type="button"
									onClick={() => setGroupBy(g)}
									className={cn(
										"px-2.5 py-1.5 capitalize",
										groupBy === g ? "bg-accent-500 text-white" : "text-text-tertiary",
									)}
								>
									{g}
								</button>
							))}
						</div>
					</div>
				</SheetHeader>

				{loading ? (
					<div className="grid place-items-center h-40 text-text-tertiary">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : !data || totalPerms === 0 ? (
					<p className="text-small text-text-tertiary p-4">
						No access — this person has no permissions.
					</p>
				) : groupBy === "module" ? (
					<div className="p-3 space-y-3">
						{moduleGroups.map((m) => (
							<div key={m.key}>
								<p className="text-label text-text-tertiary px-1 mb-1">{m.label}</p>
								<div className="rounded-xl border border-border-subtle divide-y divide-white/5">
									{m.permissions.map((p) => (
										<PermRow key={p.code} p={p} showSource />
									))}
								</div>
							</div>
						))}
						{moduleGroups.length === 0 && (
							<p className="text-small text-text-tertiary px-1 py-4">No permissions match.</p>
						)}
					</div>
				) : (
					<div className="p-3 space-y-3">
						{roleGroups.map(({ role, perms }) => (
							<div key={role.code}>
								<p className="text-small font-semibold text-accent-200 px-1 mb-1">{role.name}</p>
								<div className="rounded-xl border border-border-subtle divide-y divide-white/5">
									{perms.map((p) => (
										<PermRow key={p.code} p={p} showSource={false} />
									))}
								</div>
							</div>
						))}
						{roleGroups.length === 0 && (
							<p className="text-small text-text-tertiary px-1 py-4">No permissions match.</p>
						)}
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
