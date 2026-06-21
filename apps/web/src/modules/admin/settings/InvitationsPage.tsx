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

import { type InvitationActivity, type InvitationRow, invitationsApi } from "../invitations-api";
import {
	STATUS_LABEL,
	STATUS_ORDER,
	STATUS_TONE,
	funnel,
	initials,
	timingLabel,
} from "../lib/invitation-ui";

const AVATAR_BG = ["bg-lavender", "bg-sky", "bg-mint", "bg-peach", "bg-yellow", "bg-coral"];
function avatarBg(id: string): string {
	let h = 0;
	for (const ch of id) h = (h + ch.charCodeAt(0)) % AVATAR_BG.length;
	return AVATAR_BG[h];
}

function fmtFull(iso: string | null): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export default function InvitationsPage() {
	const [rows, setRows] = useState<InvitationRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<"all" | string>("all");
	const [activityOf, setActivityOf] = useState<InvitationRow | null>(null);
	const [activity, setActivity] = useState<InvitationActivity[] | null>(null);

	const refresh = useCallback(async () => {
		try {
			setRows(await invitationsApi.list());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load invitations");
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
	const shown = filter === "all" ? rows : rows.filter((r) => r.effective_status === filter);

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
			const link = await invitationsApi.copyLink(id);
			await navigator.clipboard.writeText(link);
			toast.success("Fresh activation link copied (the previous link is now invalid)");
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

	if (loading) return <Skeleton className="h-64 rounded-2xl" />;

	return (
		<div className="space-y-5">
			{/* Hero */}
			<section
				className="relative overflow-hidden rounded-2xl border border-border-subtle p-5 flex flex-wrap items-center justify-between gap-4"
				style={{
					background:
						"radial-gradient(480px 200px at 8% 130%, rgb(124 92 255 / 0.4), transparent 60%), radial-gradient(420px 200px at 82% -40%, rgb(160 207 236 / 0.14), transparent 60%), linear-gradient(120deg, #191330, #120f22 55%, #0e1722)",
				}}
			>
				<div className="relative z-10">
					<p className="layer-eyebrow text-accent-200">Onboarding</p>
					<h1 className="text-2xl font-extralight tracking-tight">Invitations</h1>
					<p className="text-small text-text-secondary mt-0.5">
						{f.total} total · {f.pending} awaiting activation
					</p>
				</div>
				<div className="relative z-10 flex items-center gap-2.5">
					<Stat value={f.pending} label="pending" tone="text-sky" />
					<Stat value={f.activated} label="activated" tone="text-mint" />
					<Stat value={f.expired} label="expired" tone="text-yellow" />
					<Button asChild className="soft-glow rounded-xl">
						<Link to="/admin/settings/users/new">
							<MailPlus className="size-4 mr-1.5" /> Invite
						</Link>
					</Button>
				</div>
			</section>

			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}

			{/* Filter pills */}
			<div className="flex gap-2 flex-wrap">
				<FilterPill
					active={filter === "all"}
					onClick={() => setFilter("all")}
					label="All"
					n={rows.length}
				/>
				{STATUS_ORDER.map((s) => (
					<FilterPill
						key={s}
						active={filter === s}
						onClick={() => setFilter(s)}
						label={STATUS_LABEL[s]}
						n={counts[s] ?? 0}
					/>
				))}
			</div>

			{/* List */}
			<div className="glass-surface rounded-2xl px-1.5 py-1">
				{shown.length === 0 ? (
					<p className="text-small text-text-tertiary text-center py-10">
						No invitations {filter === "all" ? "yet" : `with status “${filter}”`}.
					</p>
				) : (
					<ul>
						{shown.map((inv) => (
							<li
								key={inv.id}
								className="flex items-center gap-3 px-3 py-2.5 border-t border-border-subtle first:border-t-0"
							>
								<span
									className={cn(
										"size-8 rounded-lg grid place-items-center text-[10px] font-bold text-canvas shrink-0",
										avatarBg(inv.user_id),
									)}
									aria-hidden
								>
									{initials(inv.employee_name)}
								</span>
								<div className="min-w-0 flex-1">
									<p className="text-small text-text-primary truncate">{inv.employee_name}</p>
									<p className="text-[11px] text-text-tertiary truncate">
										{inv.email}
										{inv.department ? ` · ${inv.department}` : ""}
										{inv.sent_count > 1 ? ` · sent ${inv.sent_count}×` : ""}
									</p>
								</div>
								<div className="text-right shrink-0">
									<StatusPill
										tone={STATUS_TONE[inv.effective_status]}
										label={STATUS_LABEL[inv.effective_status]}
									/>
									<p className="text-[10px] text-text-tertiary mt-1">{timingLabel(inv)}</p>
								</div>
								<RowMenu
									inv={inv}
									onResend={() => run("Invitation resent", () => invitationsApi.resend(inv.id))}
									onExtend={() =>
										run("Extended by 48 hours", () => invitationsApi.extend(inv.id, 48))
									}
									onRevoke={() => run("Invitation revoked", () => invitationsApi.revoke(inv.id))}
									onCopy={() => copyLink(inv.id)}
									onActivity={() => openActivity(inv)}
								/>
							</li>
						))}
					</ul>
				)}
			</div>

			<DetailPanel
				open={activityOf !== null}
				onClose={() => setActivityOf(null)}
				title={activityOf ? `Activity · ${activityOf.employee_name}` : "Activity"}
			>
				<ActivityTimeline rows={activity} />
			</DetailPanel>
		</div>
	);
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
	return (
		<div className="glass-surface rounded-xl px-3 py-1.5 text-center">
			<div className={cn("text-base font-light tabular-nums leading-none", tone)}>{value}</div>
			<div className="layer-eyebrow mt-1">{label}</div>
		</div>
	);
}

function FilterPill({
	active,
	onClick,
	label,
	n,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	n: number;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"text-small px-3 py-1 rounded-lg border transition-colors",
				active
					? "bg-accent-500 text-white border-transparent"
					: "border-border-subtle text-text-secondary hover:bg-surface-elevated/50",
			)}
		>
			{label} {n}
		</button>
	);
}

function RowMenu({
	inv,
	onResend,
	onExtend,
	onRevoke,
	onCopy,
	onActivity,
}: {
	inv: InvitationRow;
	onResend: () => void;
	onExtend: () => void;
	onRevoke: () => void;
	onCopy: () => void;
	onActivity: () => void;
}) {
	const live = inv.effective_status !== "activated" && inv.effective_status !== "revoked";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={`Actions for ${inv.employee_name}`}
					className="size-7 grid place-items-center rounded-lg text-text-tertiary hover:bg-surface-elevated/60 shrink-0"
				>
					<MoreHorizontal className="size-4" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{live && (
					<DropdownMenuItem onClick={onResend}>
						<RotateCw className="size-4 mr-2" /> Resend invitation
					</DropdownMenuItem>
				)}
				{live && (
					<DropdownMenuItem onClick={onExtend}>
						<Clock className="size-4 mr-2" /> Extend 48 hours
					</DropdownMenuItem>
				)}
				{live && (
					<DropdownMenuItem onClick={onCopy}>
						<Copy className="size-4 mr-2" /> Copy activation link
					</DropdownMenuItem>
				)}
				<DropdownMenuItem onClick={onActivity}>
					<Link2 className="size-4 mr-2" /> View activity
				</DropdownMenuItem>
				{live && <DropdownMenuSeparator />}
				{live && (
					<DropdownMenuItem onClick={onRevoke} className="text-coral focus:text-coral">
						<XCircle className="size-4 mr-2" /> Revoke invitation
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

const ACTION_META: Record<string, { label: string; tone: string }> = {
	"invitation.created": { label: "Invitation created", tone: "bg-mint" },
	"invitation.sent": { label: "Email sent", tone: "bg-sky" },
	"invitation.opened": { label: "Link opened", tone: "bg-lavender" },
	"invitation.activated": { label: "Account activated", tone: "bg-mint" },
	"invitation.resent": { label: "Invitation resent", tone: "bg-sky" },
	"invitation.extended": { label: "Expiry extended", tone: "bg-yellow" },
	"invitation.link_copied": { label: "Link copied / rotated", tone: "bg-peach" },
	"invitation.revoked": { label: "Invitation revoked", tone: "bg-coral" },
};

function ActivityTimeline({ rows }: { rows: InvitationActivity[] | null }) {
	if (rows === null) return <Skeleton className="h-32 rounded-xl" />;
	if (rows.length === 0)
		return <p className="text-small text-text-tertiary">No activity recorded yet.</p>;
	return (
		<ol className="space-y-0">
			{rows.map((r, i) => {
				const meta = ACTION_META[r.action] ?? { label: r.action, tone: "bg-white/20" };
				const ip = typeof r.ip === "string" ? r.ip : null;
				return (
					<li key={`${r.action}-${i}`} className="flex gap-3">
						<div className="flex flex-col items-center">
							<span className={cn("size-2 rounded-full mt-1.5", meta.tone)} />
							{i < rows.length - 1 && <span className="w-px flex-1 bg-border-subtle mt-1" />}
						</div>
						<div className="pb-4 min-w-0">
							<p className="text-small text-text-primary">{meta.label}</p>
							<p className="text-[11px] text-text-tertiary">
								{fmtFull(r.ts)}
								{ip ? ` · ${ip}` : ""}
								{r.user_agent ? ` · ${r.user_agent}` : ""}
							</p>
						</div>
					</li>
				);
			})}
		</ol>
	);
}
