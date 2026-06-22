import { Clock, Copy, Link2, MailPlus, MoreHorizontal, RotateCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { DetailPanel, StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { GrowthHero } from "@/modules/certification/components/GrowthHero";
import { type InvitationActivity, type InvitationRow, invitationsApi } from "../invitations-api";
import { STATUS_LABEL, STATUS_TONE, funnel, initials, timingLabel } from "../lib/invitation-ui";

const AVATAR_BG = ["bg-lavender", "bg-sky", "bg-mint", "bg-peach", "bg-yellow", "bg-coral"];
function avatarBg(id: string): string {
	let h = 0;
	for (const ch of id) h = (h + ch.charCodeAt(0)) % AVATAR_BG.length;
	return AVATAR_BG[h];
}

const ACTION_META: Record<string, string> = {
	"invitation.created": "Invitation created",
	"invitation.sent": "Email sent",
	"invitation.opened": "Link opened",
	"invitation.activated": "Account activated",
	"invitation.resent": "Invitation resent",
	"invitation.extended": "Expiry extended",
	"invitation.link_copied": "Link copied / rotated",
	"invitation.revoked": "Invitation revoked",
};

export function InvitationsColumn() {
	const [rows, setRows] = useState<InvitationRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [activityOf, setActivityOf] = useState<InvitationRow | null>(null);
	const [activity, setActivity] = useState<InvitationActivity[] | null>(null);

	const refresh = useCallback(async () => {
		try {
			setRows(await invitationsApi.list());
		} catch {
			setRows([]);
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		void refresh();
	}, [refresh]);

	const f = useMemo(() => funnel(rows), [rows]);
	const counts = useMemo(() => {
		const c: Record<string, number> = {};
		for (const r of rows) c[r.effective_status] = (c[r.effective_status] ?? 0) + 1;
		return c;
	}, [rows]);
	const nextExpiring = useMemo(
		() =>
			rows
				.filter((r) => r.effective_status === "sent" || r.effective_status === "opened")
				.sort((a, b) => a.expires_at.localeCompare(b.expires_at))[0] ?? null,
		[rows],
	);

	async function run(label: string, fn: () => Promise<unknown>) {
		try {
			await fn();
			toast.success(label);
			await refresh();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Action failed");
		}
	}
	async function copyLink(id: string) {
		try {
			await navigator.clipboard.writeText(await invitationsApi.copyLink(id));
			toast.success("Fresh activation link copied (previous link is now invalid)");
			await refresh();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not copy link");
		}
	}
	async function openActivity(inv: InvitationRow) {
		setActivityOf(inv);
		setActivity(null);
		try {
			setActivity(await invitationsApi.activity(inv.id));
		} catch {
			setActivity([]);
		}
	}

	if (loading) return <Skeleton className="h-[244px] rounded-2xl" />;

	return (
		<div className="flex flex-col gap-3">
			<p className="layer-eyebrow">／ Invitations</p>
			<GrowthHero
				accent="yellow"
				eyebrow="Onboarding · invites"
				headline={f.pending > 0 ? `${f.pending} awaiting activation` : "All activated"}
				context={`${f.total} total · ${f.activated} activated`}
				ringSegments={[
					{ value: f.activated, color: "mint" },
					{ value: f.pending, color: "sky" },
					{ value: f.expired, color: "yellow" },
				]}
				ringCenter={String(f.total)}
				ringSub="sent"
				tiles={[
					{ n: counts.sent ?? 0, label: "Sent", tone: "sky" },
					{ n: f.activated, label: "Active", tone: "mint" },
					{ n: f.expired, label: "Expired", tone: "yellow" },
				]}
				nextUp={
					nextExpiring ? (
						<span className="text-text-secondary truncate">
							⚠️ Next — <b className="text-text-primary">{nextExpiring.employee_name}</b> ·{" "}
							{timingLabel(nextExpiring)}
						</span>
					) : (
						<span className="text-text-tertiary">No invites awaiting activation.</span>
					)
				}
				action={
					<Button asChild className="soft-glow rounded-xl shrink-0">
						<Link to="/admin/people/accounts/new">
							<MailPlus className="size-4 mr-1" /> Invite
						</Link>
					</Button>
				}
			/>

			<div className="glass-surface rounded-2xl px-1.5 py-1">
				{rows.length === 0 ? (
					<p className="text-small text-text-tertiary text-center py-8">No invitations yet.</p>
				) : (
					<ul className="max-h-[360px] overflow-y-auto">
						{rows.map((inv) => {
							const live =
								inv.effective_status !== "activated" && inv.effective_status !== "revoked";
							return (
								<li
									key={inv.id}
									className="flex items-center gap-2.5 px-2.5 py-2 border-t border-border-subtle first:border-t-0"
								>
									<span
										className={cn(
											"size-7 rounded-lg grid place-items-center text-[9px] font-bold text-canvas shrink-0",
											avatarBg(inv.user_id),
										)}
										aria-hidden
									>
										{initials(inv.employee_name)}
									</span>
									<div className="min-w-0 flex-1">
										<p className="text-small text-text-primary truncate">{inv.employee_name}</p>
										<p className="text-[10px] text-text-tertiary truncate">
											{inv.sent_to_email && inv.sent_to_email !== inv.email
												? `→ ${inv.sent_to_email} · ${timingLabel(inv)}`
												: timingLabel(inv)}
										</p>
									</div>
									<StatusPill
										tone={STATUS_TONE[inv.effective_status]}
										label={STATUS_LABEL[inv.effective_status]}
									/>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<button
												type="button"
												aria-label={`Actions for ${inv.employee_name}`}
												className="size-6 grid place-items-center rounded-lg text-text-tertiary hover:bg-surface-elevated/60 shrink-0"
											>
												<MoreHorizontal className="size-4" />
											</button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											{live && (
												<DropdownMenuItem
													onClick={() =>
														run("Invitation resent", () => invitationsApi.resend(inv.id))
													}
												>
													<RotateCw className="size-4 mr-2" /> Resend
												</DropdownMenuItem>
											)}
											{live && (
												<DropdownMenuItem
													onClick={() =>
														run("Extended 48h", () => invitationsApi.extend(inv.id, 48))
													}
												>
													<Clock className="size-4 mr-2" /> Extend 48h
												</DropdownMenuItem>
											)}
											{live && (
												<DropdownMenuItem onClick={() => copyLink(inv.id)}>
													<Copy className="size-4 mr-2" /> Copy link
												</DropdownMenuItem>
											)}
											<DropdownMenuItem onClick={() => openActivity(inv)}>
												<Link2 className="size-4 mr-2" /> View activity
											</DropdownMenuItem>
											{live && <DropdownMenuSeparator />}
											{live && (
												<DropdownMenuItem
													onClick={() =>
														run("Invitation revoked", () => invitationsApi.revoke(inv.id))
													}
													className="text-coral focus:text-coral"
												>
													<XCircle className="size-4 mr-2" /> Revoke
												</DropdownMenuItem>
											)}
										</DropdownMenuContent>
									</DropdownMenu>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<DetailPanel
				open={activityOf !== null}
				onClose={() => setActivityOf(null)}
				title={activityOf ? `Activity · ${activityOf.employee_name}` : "Activity"}
			>
				{activity === null ? (
					<Skeleton className="h-32 rounded-xl" />
				) : activity.length === 0 ? (
					<p className="text-small text-text-tertiary">No activity recorded yet.</p>
				) : (
					<ol className="space-y-0">
						{activity.map((a, i) => (
							<li key={`${a.action}-${i}`} className="flex gap-3">
								<div className="flex flex-col items-center">
									<span className="size-2 rounded-full mt-1.5 bg-accent-300" />
									{i < activity.length - 1 && (
										<span className="w-px flex-1 bg-border-subtle mt-1" />
									)}
								</div>
								<div className="pb-4 min-w-0">
									<p className="text-small text-text-primary">
										{ACTION_META[a.action] ?? a.action}
									</p>
									<p className="text-[11px] text-text-tertiary">
										{new Date(a.ts).toLocaleString("en-MY", {
											day: "numeric",
											month: "short",
											hour: "2-digit",
											minute: "2-digit",
										})}
										{typeof a.ip === "string" ? ` · ${a.ip}` : ""}
									</p>
								</div>
							</li>
						))}
					</ol>
				)}
			</DetailPanel>
		</div>
	);
}
