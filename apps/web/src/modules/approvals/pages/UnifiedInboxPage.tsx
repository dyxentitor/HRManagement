import { useCallback, useEffect, useMemo, useState } from "react";

import {
	ApprovalActionBar,
	DetailPanel,
	EmptyState,
	StatusPill,
} from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/utils";

import { type InboxItem, approveItem, getInbox, rejectItem } from "../api";

type Filter = "all" | InboxItem["kind"] | "kpi";

const TYPE_TONE: Record<InboxItem["kind"] | "kpi", "yellow" | "peach" | "sky"> =
	{
		leave: "yellow",
		claim: "peach",
		kpi: "sky",
	};

function timeAgo(iso: string | null): string {
	if (!iso) return "—";
	const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
	if (m < 1) return "just now";
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

function gradientFromCode(code: string): [string, string] {
	const palettes: [string, string][] = [
		["peach", "coral"],
		["lavender", "sky"],
		["mint", "yellow"],
	];
	let h = 0;
	for (let i = 0; i < code.length; i++) {
		h = (h * 31 + code.charCodeAt(i)) >>> 0;
	}
	return palettes[h % palettes.length] ?? ["lavender", "sky"];
}

export default function UnifiedInboxPage() {
	const [items, setItems] = useState<InboxItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await getInbox();
			setItems(data);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const counts = useMemo(
		() => ({
			all: items.length,
			leave: items.filter((i) => i.kind === "leave").length,
			claim: items.filter((i) => i.kind === "claim").length,
			kpi: items.filter((i) => i.kind === "kpi").length,
		}),
		[items],
	);

	const filtered = useMemo(() => {
		if (filter === "all") return items;
		return items.filter((i) => i.kind === filter);
	}, [items, filter]);

	const selected = filtered.find((i) => i.id === selectedId) ?? null;

	const onApprove = async (comment: string) => {
		if (!selected) return;
		setBusy(true);
		try {
			await approveItem(selected.kind, selected.id, comment);
			setSelectedId(null);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Approve failed");
		} finally {
			setBusy(false);
		}
	};

	const onReject = async (comment: string) => {
		if (!selected) return;
		setBusy(true);
		try {
			await rejectItem(selected.kind, selected.id, comment);
			setSelectedId(null);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Reject failed");
		} finally {
			setBusy(false);
		}
	};

	const filterPill = (key: Filter, label: string) => (
		<button
			key={key}
			type="button"
			onClick={() => setFilter(key)}
			className={cn(
				"px-3 py-1 rounded-full text-small font-semibold transition-colors duration-fast",
				filter === key
					? "bg-lavender/15 text-lavender shadow-[inset_0_0_0_1px_rgb(var(--pastel-lavender)/0.3)]"
					: "bg-canvas border border-border-subtle text-text-tertiary hover:text-text-secondary",
			)}
		>
			{label} · {counts[key as keyof typeof counts]}
		</button>
	);

	return (
		<div className="space-y-4">
			<PageHeader title="Approvals" subtitle={`${counts.all} pending`} />

			{error && (
				<p className="text-coral text-small" role="alert">
					{error}
				</p>
			)}

			<div className="flex gap-2">
				{filterPill("all", "All")}
				{filterPill("leave", "Leave")}
				{filterPill("claim", "Claims")}
				{filterPill("kpi", "KPI")}
			</div>

			<div className="space-y-1.5">
				{loading ? (
					<p className="text-text-tertiary">Loading…</p>
				) : filtered.length === 0 ? (
					<EmptyState
						icon="🎉"
						title="All caught up"
						description={`No pending ${filter === "all" ? "approvals" : filter} for you right now.`}
					/>
				) : (
					filtered.map((item) => {
						const [from, to] = gradientFromCode(item.employee_code);
						const isSelected = selectedId === item.id;
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => setSelectedId(item.id)}
								className={cn(
									"w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors duration-fast",
									isSelected
										? "bg-accent-500/10 border border-accent-500/40"
										: "bg-surface-hover border border-border-subtle hover:border-accent-500/30",
								)}
							>
								<div
									className={cn(
										"size-7 rounded-full bg-gradient-to-br shrink-0",
										`from-${from}`,
										`to-${to}`,
									)}
									aria-hidden
								/>
								<div className="flex-1 min-w-0">
									<p className="text-h3 text-text-primary truncate">
										{item.employee_code} · {item.summary}
									</p>
									<p className="text-small text-text-tertiary truncate">
										Submitted {timeAgo(item.submitted_at)}
									</p>
								</div>
								<StatusPill tone={TYPE_TONE[item.kind]} label={item.kind} />
							</button>
						);
					})
				)}
			</div>

			<DetailPanel
				open={selected !== null}
				onClose={() => setSelectedId(null)}
				title={selected ? `${selected.kind} · ${selected.id}` : ""}
				footer={
					selected ? (
						<ApprovalActionBar
							onApprove={onApprove}
							onReject={onReject}
							busy={busy}
							requireRejectComment
						/>
					) : null
				}
			>
				{selected && (
					<dl className="grid grid-cols-[110px_1fr] gap-y-2 text-body">
						<dt className="text-label uppercase text-text-tertiary self-center">
							Employee
						</dt>
						<dd>{selected.employee_code}</dd>
						<dt className="text-label uppercase text-text-tertiary self-center">
							Summary
						</dt>
						<dd>{selected.summary}</dd>
						<dt className="text-label uppercase text-text-tertiary self-center">
							Submitted
						</dt>
						<dd>{timeAgo(selected.submitted_at)}</dd>
					</dl>
				)}
			</DetailPanel>
		</div>
	);
}
