import {
	AlertTriangle,
	Archive,
	CalendarDays,
	Hash,
	KeyRound,
	Link2,
	Mail,
	Phone,
	Send,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/perm";
import { cn } from "@/lib/utils";

import { type InvitationRow, invitationsApi } from "@/modules/admin/invitations-api";
import { type Employee, employeeApi } from "../api";
import { formatJoinedDate, tenureFromHireDate } from "../lib/format";
import { AvatarUpload } from "./AvatarUpload";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function humanize(s: string): string {
	return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Profile summary + quick actions for the employee edit page (3 bands). */
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

	const meta: { icon: typeof Hash; label: string; value: string }[] = [
		{ icon: Hash, label: "Employee ID", value: employee.employee_code || "—" },
		{ icon: Mail, label: "Work email", value: employee.email || "—" },
		{
			icon: CalendarDays,
			label: "Joined",
			value: employee.hire_date
				? `${formatJoinedDate(employee.hire_date)} (${tenureFromHireDate(employee.hire_date)})`
				: "—",
		},
		{ icon: Phone, label: "Phone", value: employee.phone || "—" },
	];

	const pct = employee.profile_completeness?.percent ?? null;
	const missing = (employee.profile_completeness?.missing ?? []).map(humanize);
	const complete = pct === null || pct >= 100;
	const message = complete
		? "Profile complete."
		: (pct ?? 0) >= 80
			? "Almost complete — only a few items left."
			: (pct ?? 0) >= 50
				? "Getting there — keep filling in the details."
				: "This profile needs more details.";

	return (
		<section className="relative overflow-hidden rounded-lg border border-border-subtle bg-surface-hover">
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					background:
						"radial-gradient(560px 200px at 0% 0%, rgb(124 92 255 / 0.13), transparent 65%)",
				}}
				aria-hidden
			/>

			{/* Band 1 — identity + actions */}
			<div className="relative z-10 flex flex-wrap items-start justify-between gap-4 p-5">
				<div className="flex items-center gap-3.5 min-w-0">
					<AvatarUpload
						photoUrl={employee.photo_url ?? null}
						fullName={employee.full_name}
						size="md"
						showRemove={false}
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
							{employee.department_name ? (
								<>
									{" · "}
									<span className="text-accent-200">{employee.department_name}</span>
								</>
							) : null}
						</p>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{canWrite && employee.user_id && (
						<Button variant="outline" size="sm" onClick={resetPassword} disabled={busy === "reset"}>
							<KeyRound className="size-4 mr-1.5" /> Reset password
						</Button>
					)}
					{canInvite && employee.user_id && !activated && (
						<Button variant="outline" size="sm" onClick={sendInvite} disabled={busy === "invite"}>
							<Send className="size-4 mr-1.5" />
							{hasLiveInvite ? "Resend invitation" : "Send invitation"}
						</Button>
					)}
					{canInvite && hasLiveInvite && (
						<Button variant="outline" size="sm" onClick={copyLink} disabled={busy === "copy"}>
							<Link2 className="size-4 mr-1.5" /> Copy link
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
								<Archive className="size-4 mr-1.5" /> Archive employee
							</Button>
						))}
				</div>
			</div>

			{/* Band 2 — meta grid */}
			<div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-t border-border-subtle">
				{meta.map((m, i) => (
					<div
						key={m.label}
						className={cn(
							"flex items-start gap-2.5 px-5 py-3",
							i > 0 && "lg:border-l border-border-subtle",
						)}
					>
						<m.icon className="size-4 text-text-tertiary mt-0.5 shrink-0" aria-hidden />
						<div className="min-w-0">
							<p className="layer-eyebrow">{m.label}</p>
							<p className="text-small text-text-primary truncate mt-0.5">{m.value}</p>
						</div>
					</div>
				))}
			</div>

			{/* Band 3 — completeness */}
			<div className="relative z-10 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6 px-5 py-3.5 border-t border-border-subtle">
				<div className="lg:flex-1 min-w-0">
					<div className="flex items-center justify-between text-small mb-1.5">
						<span className="layer-eyebrow">Profile completion</span>
						<span className="tabular-nums font-semibold text-accent-200">{pct ?? 100}%</span>
					</div>
					<div className="h-1.5 rounded-full bg-surface-elevated/60 overflow-hidden">
						<div
							className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-300 transition-all"
							style={{ width: `${pct ?? 100}%` }}
						/>
					</div>
				</div>
				<div className="flex items-center gap-2.5 lg:justify-end shrink-0">
					<span className="text-small text-text-tertiary">{message}</span>
					{!complete && missing.length > 0 && (
						<span className="inline-flex items-center gap-1.5 text-[11px] text-yellow bg-yellow/10 border border-yellow/30 rounded-full px-2.5 py-1">
							<AlertTriangle className="size-3.5 shrink-0" aria-hidden />
							Missing: {missing.join(", ")}
						</span>
					)}
				</div>
			</div>
		</section>
	);
}
