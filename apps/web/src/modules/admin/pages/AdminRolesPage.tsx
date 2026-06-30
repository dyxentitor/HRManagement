import { Loader2, Lock, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/perm";
import { cn } from "@/lib/utils";

import {
	type CatalogueModule,
	type RoleDetail,
	type RoleMember,
	type RoleSummary,
	permissionApi,
	roleApi,
	roleMembersApi,
} from "../api";
import { PermissionAccordion } from "../components/PermissionAccordion";
import { RoleFormModal } from "../components/RoleFormModal";
import { RoleMembersTab } from "../components/RoleMembersTab";

// org_admin must keep these; render them locked.
const ADMIN_FLOOR = new Set([
	"role:read",
	"role:write",
	"org:feature_flag:read",
	"org:feature_flag:write",
]);
function lockedReasonFor(role: RoleDetail | null) {
	return (code: string): string | null => {
		if (role?.code === "org_admin" && (ADMIN_FLOOR.has(code) || code.startsWith("identity:"))) {
			return "Required for the Org Admin role — can't be removed.";
		}
		return null;
	};
}

export default function AdminRolesPage() {
	const canWrite = useCan("role:write");
	const navigate = useNavigate();
	const { code: routeCode } = useParams<{ code?: string }>();

	const [roles, setRoles] = useState<RoleSummary[]>([]);
	const [selected, setSelected] = useState<string | null>(null);
	const [detail, setDetail] = useState<RoleDetail | null>(null);
	const [modules, setModules] = useState<CatalogueModule[]>([]);
	const [draft, setDraft] = useState<Set<string>>(new Set());
	const [members, setMembers] = useState<RoleMember[]>([]);
	const [tab, setTab] = useState<"permissions" | "members">("permissions");
	const [search, setSearch] = useState("");
	const [grantedOnly, setGrantedOnly] = useState(false);
	const [roleSearch, setRoleSearch] = useState("");
	const [saving, setSaving] = useState(false);
	const [loadingDetail, setLoadingDetail] = useState(false);
	const [modal, setModal] = useState<{
		open: boolean;
		mode: "empty" | "clone";
		source?: string;
	}>({ open: false, mode: "empty" });

	const loadRoles = useCallback(async () => {
		const list = await roleApi.list().catch(() => []);
		setRoles(list);
		return list;
	}, []);

	const loadDetail = useCallback(async (code: string) => {
		setLoadingDetail(true);
		try {
			const [d, mods, mem] = await Promise.all([
				roleApi.retrieve(code),
				permissionApi.catalogue(code),
				roleMembersApi.list(code).catch(() => []),
			]);
			setDetail(d);
			setModules(mods);
			setDraft(new Set(d.permissions));
			setMembers(mem);
		} finally {
			setLoadingDetail(false);
		}
	}, []);

	useEffect(() => {
		void loadRoles().then((list) => {
			setSelected(routeCode ?? list[0]?.code ?? null);
		});
	}, [loadRoles, routeCode]);

	useEffect(() => {
		if (selected) void loadDetail(selected);
	}, [selected, loadDetail]);

	const dirty = useMemo(() => {
		if (!detail) return false;
		const orig = new Set(detail.permissions);
		if (orig.size !== draft.size) return true;
		for (const c of draft) if (!orig.has(c)) return true;
		return false;
	}, [detail, draft]);

	function select(code: string) {
		setSelected(code);
		setTab("permissions");
		setSearch("");
		setGrantedOnly(false);
		navigate(`/admin/settings/roles/${code}`, { replace: true });
	}

	function toggle(code: string, next: boolean) {
		setDraft((prev) => {
			const n = new Set(prev);
			if (next) n.add(code);
			else n.delete(code);
			return n;
		});
	}

	async function save() {
		if (!detail) return;
		setSaving(true);
		try {
			const updated = await roleApi.setPermissions(detail.code, [...draft], detail.updated_at);
			setDetail(updated);
			setDraft(new Set(updated.permissions));
			setModules(await permissionApi.catalogue(detail.code));
			void loadRoles();
			toast.success("Permissions saved.");
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Could not save.";
			toast.error(msg);
			if (msg.toLowerCase().includes("changed by someone else")) {
				void loadDetail(detail.code); // reload after an optimistic-lock conflict
			}
		} finally {
			setSaving(false);
		}
	}

	async function resetRole() {
		if (!detail) return;
		try {
			await roleApi.reset(detail.code);
			await loadDetail(detail.code);
			void loadRoles();
			toast.success("Reset to defaults.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not reset.");
		}
	}

	function openCreate() {
		setModal({ open: true, mode: "empty", source: undefined });
	}
	function cloneRole(src: RoleSummary) {
		setModal({ open: true, mode: "clone", source: src.code });
	}
	async function onRoleCreated(r: RoleDetail) {
		await loadRoles();
		select(r.code);
		toast.success(`Created "${r.name}".`);
	}

	async function deleteRole(role: RoleSummary) {
		if (!window.confirm(`Delete "${role.name}"? This can't be undone.`)) return;
		try {
			await roleApi.remove(role.code);
			const list = await loadRoles();
			setSelected(list[0]?.code ?? null);
			toast.success(`Deleted "${role.name}".`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not delete role.");
		}
	}

	const systemRoles = roles.filter((r) => r.is_system);
	const customRoles = roles.filter((r) => !r.is_system);
	const filterRoles = (list: RoleSummary[]) =>
		roleSearch ? list.filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase())) : list;

	return (
		<div className="space-y-4">
			<PageHeader
				title="Roles & Permissions"
				subtitle={`${systemRoles.length} system · ${customRoles.length} custom`}
				actions={
					canWrite ? (
						<Button type="button" onClick={openCreate} className="bg-accent-500 text-white">
							<Plus className="size-4 mr-1" /> New role
						</Button>
					) : null
				}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
				<aside className="glass-surface rounded-2xl p-2 h-fit">
					<div className="flex items-center gap-2 px-2 py-1.5 mb-1">
						<Search className="size-3.5 text-text-tertiary" />
						<input
							value={roleSearch}
							onChange={(e) => setRoleSearch(e.target.value)}
							placeholder="Search roles…"
							aria-label="Search roles"
							className="bg-transparent text-small text-text-secondary w-full focus:outline-none"
						/>
					</div>
					<RailSection
						label="System"
						roles={filterRoles(systemRoles)}
						selected={selected}
						onSelect={select}
					/>
					<RailSection
						label="Custom"
						roles={filterRoles(customRoles)}
						selected={selected}
						onSelect={select}
						canWrite={canWrite}
						onClone={cloneRole}
						onDelete={deleteRole}
					/>
				</aside>

				<section className="glass-surface rounded-2xl min-h-[400px]">
					{!detail || loadingDetail ? (
						<div className="grid place-items-center h-[400px] text-text-tertiary">
							<Loader2 className="size-5 animate-spin" />
						</div>
					) : (
						<>
							<div className="p-4 border-b border-border-subtle">
								<div className="flex items-start justify-between gap-3">
									<div>
										<div className="flex items-center gap-2">
											<h2 className="text-h3 text-text-primary">{detail.name}</h2>
											{detail.is_system && (
												<span className="inline-flex items-center gap-1 text-[10px] font-semibold text-yellow bg-yellow/15 px-2 py-0.5 rounded-full">
													<Lock className="size-3" /> System
												</span>
											)}
										</div>
										{detail.description && (
											<p className="text-small text-text-tertiary mt-0.5">{detail.description}</p>
										)}
										<p className="text-small text-text-tertiary mt-0.5">
											{detail.member_count} members · {detail.permissions.length} permissions
										</p>
									</div>
									{detail.is_system && canWrite && (
										<Button type="button" variant="ghost" size="sm" onClick={resetRole}>
											Reset to defaults
										</Button>
									)}
								</div>
								<div className="flex gap-5 mt-3">
									{(["permissions", "members"] as const).map((t) => (
										<button
											key={t}
											type="button"
											onClick={() => setTab(t)}
											className={cn(
												"text-small capitalize pb-1.5",
												tab === t
													? "text-text-primary border-b-2 border-accent-500 font-semibold"
													: "text-text-tertiary",
											)}
										>
											{t}
											{t === "members" ? ` · ${members.length}` : ""}
										</button>
									))}
								</div>
							</div>

							{tab === "permissions" ? (
								<div className="p-4 space-y-3">
									<div className="flex items-center gap-2">
										<div className="flex items-center gap-2 flex-1 bg-canvas border border-border-subtle rounded-md px-3 py-1.5">
											<Search className="size-3.5 text-text-tertiary" />
											<input
												value={search}
												onChange={(e) => setSearch(e.target.value)}
												placeholder="Search permissions…"
												aria-label="Search permissions"
												className="bg-transparent text-small w-full focus:outline-none"
											/>
										</div>
										<label className="flex items-center gap-1.5 text-small text-text-secondary">
											<input
												type="checkbox"
												checked={grantedOnly}
												onChange={(e) => setGrantedOnly(e.target.checked)}
											/>
											Granted only
										</label>
									</div>
									<PermissionAccordion
										modules={modules}
										draft={draft}
										editable={canWrite}
										lockedReason={lockedReasonFor(detail)}
										onToggle={toggle}
										search={search}
										grantedOnly={grantedOnly}
									/>
									{canWrite && dirty && (
										<div className="sticky bottom-0 flex items-center justify-end gap-2 bg-surface/90 backdrop-blur border-t border-border-subtle -mx-4 px-4 py-3">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setDraft(new Set(detail.permissions))}
											>
												Discard
											</Button>
											<Button
												type="button"
												onClick={save}
												disabled={saving}
												className="bg-accent-500 text-white"
											>
												{saving ? "Saving…" : "Save changes"}
											</Button>
										</div>
									)}
								</div>
							) : (
								<RoleMembersTab
									roleCode={detail.code}
									members={members}
									canWrite={canWrite}
									onChange={(m) => {
										setMembers(m);
										void loadRoles();
										setDetail((d) => (d ? { ...d, member_count: m.length } : d));
									}}
								/>
							)}
						</>
					)}
				</section>
			</div>

			<RoleFormModal
				open={modal.open}
				onOpenChange={(o) => setModal((m) => ({ ...m, open: o }))}
				roles={roles}
				initialMode={modal.mode}
				initialSource={modal.source}
				onCreated={onRoleCreated}
			/>
		</div>
	);
}

function RailSection({
	label,
	roles,
	selected,
	onSelect,
	canWrite,
	onClone,
	onDelete,
}: {
	label: string;
	roles: RoleSummary[];
	selected: string | null;
	onSelect: (code: string) => void;
	canWrite?: boolean;
	onClone?: (r: RoleSummary) => void;
	onDelete?: (r: RoleSummary) => void;
}) {
	return (
		<div className="mb-1">
			<p className="text-label text-text-tertiary px-2 py-1.5">{label}</p>
			{roles.map((r) => (
				<div
					key={r.code}
					className={cn(
						"group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer",
						selected === r.code ? "bg-accent-500/15" : "hover:bg-white/[0.03]",
					)}
				>
					<button
						type="button"
						onClick={() => onSelect(r.code)}
						className="flex-1 text-left min-w-0"
					>
						<span
							className={cn(
								"text-small flex items-center gap-1",
								selected === r.code ? "text-accent-200 font-semibold" : "text-text-secondary",
							)}
						>
							{r.name}
							{r.is_system && <Lock className="size-3 text-text-tertiary" />}
						</span>
						<span className="block text-[10px] text-text-tertiary">
							{r.member_count} members · {r.permission_count ?? 0} perms
						</span>
					</button>
					{canWrite && onClone && (
						<div className="opacity-0 group-hover:opacity-100 flex gap-1">
							<button
								type="button"
								title="Clone"
								onClick={() => onClone(r)}
								className="text-[10px] text-text-tertiary hover:text-text-primary px-1"
							>
								Clone
							</button>
							{onDelete && (
								<button
									type="button"
									title="Delete"
									onClick={() => onDelete(r)}
									className="text-[10px] text-coral/80 hover:text-coral px-1"
								>
									Del
								</button>
							)}
						</div>
					)}
				</div>
			))}
			{roles.length === 0 && <p className="text-small text-text-tertiary px-2 py-1">None.</p>}
		</div>
	);
}
