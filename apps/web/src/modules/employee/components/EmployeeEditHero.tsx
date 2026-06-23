import { Archive, Hash, KeyRound, Link2, Mail, Phone, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/perm";
import { cn } from "@/lib/utils";

import { type InvitationRow, invitationsApi } from "@/modules/admin/invitations-api";
import { type Employee, employeeApi } from "../api";
import { AvatarUpload } from "./AvatarUpload";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function humanize(s: string): string {
	return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Profile summary + quick actions for the employee edit page. */
export function EmployeeEditHero({
	employee,
	onPhotoChange,
}: {
	employee: Employee;
	onPhotoChange: () => void;
}) {
	const navigate = useNavigate();
	const canInvite = useCan("user:create");
	const canWrite = useCan("employee:write:org");
	const canArchive = useCan("employee:archive");

	const [invite, setInvite] = useState<InvitationRow | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [armArchive, setArmArchive] = useState(false);

	const loadInvite = useCallback(async () => {
		if (!canInvite || !employee.user_id) return;
		try {
			const rows = await invitationsApi.list();
			setInvite(rows.find((r) => r.user_id === employee.user_id) ?? null);
		} catch {
			setInvite(null);
		}
	}, [canInvite, employee.user_id]);

	useEffect(() => {
		void loadInvite();
	}, [loadInvite]);

	const activated = invite?.effective_status === "activated";
	const hasLiveInvite = invite != null && invite.effective_status !== "activated";

	async function run(key: string, fn: () => Promise<void>) {
		setBusy(key);
		try {
			await fn();
		} finally {
			setBusy(null);
		}
	}

	const sendInvite = () =>
		run("invite", async () => {
			try {
				const { status } = await employeeApi.sendInvite(employee.id);
				toast.success(status === "resent" ? "Invitation resent" : "Invitation sent");
				await loadInvite();
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "Could not send invite");
			}
		});

	const copyLink = () =>
		run("copy", async () => {
			if (!invite) return;
			try {
				await navigator.clipboard.writeText(await invitationsApi.copyLink(invite.id));
				toast.success("Fresh activation link copied (previous link is now invalid)");
				await loadInvite();
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "Could not copy link");
			}
		});

	const resetPassword = () =>
		run("reset", async () => {
			if (!employee.email) return;
			try {
				await fetch(`${BASE_URL}/api/v1/auth/password/forgot`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email: employee.email }),
				});
				toast.success(`Password-reset link sent to ${employee.email}`);
			} catch {
				toast.error("Could not send the reset link");
			}
		});

	const doArchive = () =>
		run("archive", async () => {
			try {
				await employeeApi.archive(employee.id);
				toast.success(`${employee.full_name} archived`);
				navigate("/admin/people");
			} catch {
				toast.error("Could not archive employee");
			}
		});

	const meta = [
		employee.employee_code && { icon: Hash, value: employee.employee_code },
		employee.email && { icon: Mail, value: employee.email },
		employee.phone && { icon: Phone, value: employee.phone },
	].filter(Boolean) as { icon: typeof Hash; value: string }[];

	const pct = employee.profile_completeness?.percent ?? null;
	const missing = (employee.profile_completeness?.missing ?? []).map(humanize);
	const complete = pct === null || pct >= 100;

	return (
		<section className="relative overflow-hidden rounded-lg border border-border-subtle bg-surface-hover p-5">
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					background:
						"radial-gradient(520px 180px at 0% 0%, rgb(124 92 255 / 0.14), transparent 65%)",
				}}
				aria-hidden
			/>
			<div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
				{/* identity */}
				<div className="flex items-center gap-4 min-w-0">
					<AvatarUpload
						photoUrl={employee.photo_url ?? null}
						fullName={employee.full_name}
						size="lg"
						uploadFor={{ kind: "employee", id: employee.id }}
						onUploaded={onPhotoChange}
						onDeleted={onPhotoChange}
					/>
					<div className="min-w-0">
						<div className="flex items-center gap-2.5 flex-wrap">
							<h1 className="text-h2 text-text-primary">{employee.full_name}</h1>
							{employee.status && (
								<StatusPill
									tone={employee.status === "active" ? "mint" : "coral"}
									label={employee.status}
								/>
							)}
							{activated && <StatusPill tone="sky" label="Activated" />}
						</div>
						<p className="text-body text-text-secondary mt-0.5">
							{employee.role_title || "—"}
							{employee.department_name ? ` · ${employee.department_name}` : ""}
						</p>
					</div>
				</div>

				{/* quick actions */}
				<div className="flex flex-wrap items-center gap-2">
					{canInvite && employee.user_id && !activated && (
						<Button variant="outline" size="sm" onClick={sendInvite} disabled={busy === "invite"}>
							<Send className="size-4 mr-1.5" />
							{hasLiveInvite ? "Resend invite" : "Send invite"}
						</Button>
					)}
					{canInvite && hasLiveInvite && (
						<Button variant="outline" size="sm" onClick={copyLink} disabled={busy === "copy"}>
							<Link2 className="size-4 mr-1.5" /> Copy link
						</Button>
					)}
					{canWrite && employee.user_id && (
						<Button variant="outline" size="sm" onClick={resetPassword} disabled={busy === "reset"}>
							<KeyRound className="size-4 mr-1.5" /> Reset password
						</Button>
					)}
					{canArchive &&
						(armArchive ? (
							<span className="inline-flex items-center gap-1.5">
								<Button
									variant="destructive"
									size="sm"
									onClick={doArchive}
									disabled={busy === "archive"}
								>
									Confirm archive
								</Button>
								<Button variant="ghost" size="sm" onClick={() => setArmArchive(false)}>
									Cancel
								</Button>
							</span>
						) : (
							<Button
								variant="outline"
								size="sm"
								onClick={() => setArmArchive(true)}
								className="text-coral hover:text-coral border-coral/40"
							>
								<Archive className="size-4 mr-1.5" /> Archive
							</Button>
						))}
				</div>
			</div>

			{/* horizontal meta strip */}
			{meta.length > 0 && (
				<div className="relative z-10 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-text-secondary mt-3">
					{meta.map((m, i) => (
						<span key={m.value} className="inline-flex items-center gap-1.5 min-w-0">
							{i > 0 && <span className="text-text-tertiary mr-1">·</span>}
							<m.icon className="size-3.5 text-text-tertiary shrink-0" aria-hidden />
							<span className="truncate">{m.value}</span>
						</span>
					))}
				</div>
			)}

			{/* completeness */}
			<div className="relative z-10 mt-4">
				<div className="flex items-center justify-between text-small mb-1.5">
					<span className="layer-eyebrow">Profile completeness</span>
					<span
						className={cn("tabular-nums font-semibold", complete ? "text-mint" : "text-yellow")}
					>
						{pct ?? 100}%
					</span>
				</div>
				<div className="h-1.5 rounded-full bg-surface-elevated/60 overflow-hidden">
					<div
						className={cn("h-full rounded-full transition-all", complete ? "bg-mint" : "bg-yellow")}
						style={{ width: `${pct ?? 100}%` }}
					/>
				</div>
				{!complete && missing.length > 0 && (
					<p className="text-[11px] text-text-tertiary mt-1.5">
						Missing: <span className="text-text-secondary">{missing.join(", ")}</span>
					</p>
				)}
			</div>
		</section>
	);
}
