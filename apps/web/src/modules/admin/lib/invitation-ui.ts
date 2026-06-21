import type { InvitationRow, InvitationStatus } from "../invitations-api";

export type PillTone = "mint" | "yellow" | "coral" | "sky" | "lavender" | "peach";

export const STATUS_TONE: Record<InvitationStatus, PillTone> = {
	draft: "peach",
	sent: "sky",
	opened: "lavender",
	activated: "mint",
	expired: "yellow",
	revoked: "coral",
};

export const STATUS_LABEL: Record<InvitationStatus, string> = {
	draft: "Draft",
	sent: "Sent",
	opened: "Opened",
	activated: "Activated",
	expired: "Expired",
	revoked: "Revoked",
};

export const STATUS_ORDER: InvitationStatus[] = [
	"sent",
	"opened",
	"activated",
	"expired",
	"revoked",
];

function fmt(iso: string | null): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleString("en-MY", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** Contextual timing line per row (countdown for live invites, stamp otherwise). */
export function timingLabel(inv: InvitationRow): string {
	if (inv.effective_status === "activated") return `activated ${fmt(inv.activated_at)}`;
	if (inv.effective_status === "revoked") return `revoked ${fmt(inv.revoked_at)}`;
	const ms = new Date(inv.expires_at).getTime() - Date.now();
	if (ms <= 0) {
		const days = Math.max(1, Math.round(-ms / 86_400_000));
		return `expired ${days}d ago`;
	}
	const hours = Math.round(ms / 3_600_000);
	return hours < 48 ? `expires in ${hours}h` : `expires in ${Math.round(hours / 24)}d`;
}

export interface InvitationFunnel {
	total: number;
	pending: number; // sent + opened
	activated: number;
	expired: number;
}

export function funnel(rows: InvitationRow[]): InvitationFunnel {
	let pending = 0;
	let activated = 0;
	let expired = 0;
	for (const r of rows) {
		if (r.effective_status === "sent" || r.effective_status === "opened") pending += 1;
		else if (r.effective_status === "activated") activated += 1;
		else if (r.effective_status === "expired") expired += 1;
	}
	return { total: rows.length, pending, activated, expired };
}

export function initials(name: string): string {
	const parts = name.trim().split(/\s+/);
	return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
