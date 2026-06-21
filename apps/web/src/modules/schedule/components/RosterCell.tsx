import { cn } from "@/lib/utils";

import type { CellTone } from "../lib/cell-tone";
import { cellLabel, isAssignable } from "../lib/shift-semantic";

interface Props {
	viewMode: "week" | "month";
	tone: CellTone;
	employeeName: string;
	date: string;
	shiftName: string | null;
	startTime: string | null;
	endTime: string | null;
	selected: boolean;
	focused?: boolean;
	pendingEdit?: boolean;
	isHoliday?: boolean;
	onClick: () => void;
	onShiftClick: () => void;
}

const TONE_BG: Record<string, string> = {
	accent: "bg-accent-500/40 border border-accent-500/60",
	lavender: "bg-lavender/40 border border-lavender/60",
	sky: "bg-sky/40 border border-sky/60",
	yellow: "bg-yellow/40 border border-yellow/60",
	mint: "bg-mint/50 text-canvas font-semibold",
	peach: "bg-peach/10 text-text-tertiary",
	weekend: "bg-surface-elevated text-text-tertiary",
	surface: "bg-surface-hover text-text-tertiary",
	muted: "bg-canvas",
};

export function RosterCell(props: Props) {
	const {
		viewMode,
		tone,
		employeeName,
		date,
		shiftName,
		startTime,
		endTime,
		selected,
		focused = false,
		pendingEdit = false,
		isHoliday = false,
		onClick,
		onShiftClick,
	} = props;
	const dateObj = new Date(`${date}T00:00:00`);
	const dayLabel = dateObj.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
	const ariaLabel = shiftName
		? `${dayLabel}, ${employeeName}, ${shiftName} ${startTime ?? ""}–${endTime ?? ""}`
		: `${dayLabel}, ${employeeName}, no shift`;

	const inactiveStripe =
		tone.kind === "inactive"
			? "bg-[repeating-linear-gradient(45deg,rgb(var(--bg-canvas)),rgb(var(--bg-canvas))_4px,rgb(var(--bg-surface))_4px,rgb(var(--bg-surface))_8px)]"
			: "";
	const coverBorder = tone.kind === "cover-up" ? "ring-2 ring-coral" : "";
	const isDraft = pendingEdit || (tone.kind === "shift" && tone.isPublished === false);

	const label = cellLabel(tone, shiftName, viewMode);
	const assignable = isAssignable(tone);

	const cls = cn(
		"group relative w-full grid place-items-center rounded text-text-primary transition-colors cursor-pointer",
		viewMode === "month" ? "h-7" : "h-14",
		TONE_BG[tone.tone] ?? "",
		inactiveStripe,
		coverBorder,
		isHoliday && "ring-1 ring-inset ring-peach/50",
		selected && "outline outline-2 outline-accent-500/60",
		focused && "outline outline-2 outline-accent-500 ring-2 ring-accent-500/30",
		"hover:outline hover:outline-1 hover:outline-accent-500/40",
	);

	function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
		if (e.shiftKey) onShiftClick();
		else onClick();
	}

	return (
		<button
			type="button"
			aria-label={ariaLabel}
			title={shiftName ? `${shiftName} (${startTime}–${endTime})` : "No shift"}
			onClick={handleClick}
			className={cls}
		>
			{label && (
				<span
					className={cn(
						"font-semibold tracking-wide uppercase",
						viewMode === "month" ? "text-[10px]" : "text-[9px]",
					)}
				>
					{label}
				</span>
			)}
			{!label && assignable && (
				<span className="text-text-tertiary text-xs opacity-0 group-hover:opacity-100 transition-opacity">
					+
				</span>
			)}
			{tone.kind === "cover-up" && (
				<span className="absolute -top-1 -right-1 text-[8px] text-coral">⤴</span>
			)}
			{isDraft && (
				<span
					data-testid="draft-dot"
					className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-coral"
					aria-hidden
				/>
			)}
		</button>
	);
}
