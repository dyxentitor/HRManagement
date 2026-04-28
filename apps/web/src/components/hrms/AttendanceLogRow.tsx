import { cn } from "@/lib/utils";

import { StatusPill } from "./StatusPill";

export interface AttendanceLogRowProps {
	name: string;
	subtitle?: string;
	clockIn: string;
	clockOut: string | null;
	status: {
		tone: "mint" | "yellow" | "coral" | "lavender" | "peach" | "sky";
		label: string;
	};
	gradient?: [string, string];
}

const PALETTES: [string, string][] = [
	["peach", "coral"],
	["lavender", "sky"],
	["mint", "yellow"],
];

function gradientFromName(name: string): [string, string] {
	let h = 0;
	for (let i = 0; i < name.length; i++) {
		h = (h * 31 + name.charCodeAt(i)) >>> 0;
	}
	return PALETTES[h % PALETTES.length] ?? ["lavender", "sky"];
}

export function AttendanceLogRow({
	name,
	subtitle,
	clockIn,
	clockOut,
	status,
	gradient,
}: AttendanceLogRowProps) {
	const [from, to] = gradient ?? gradientFromName(name);
	return (
		<div className="flex items-center gap-2 py-1.5 border-b border-border-subtle last:border-b-0">
			<div
				className={cn(
					"size-6 rounded-full bg-gradient-to-br shrink-0",
					`from-${from}`,
					`to-${to}`,
				)}
				aria-hidden
			/>
			<div className="min-w-0 flex-1">
				<p className="text-small text-text-primary truncate">{name}</p>
				<p className="text-small text-text-tertiary">
					{subtitle ? `${subtitle} · ` : ""}In {clockIn} · Out {clockOut ?? "—"}
				</p>
			</div>
			<StatusPill tone={status.tone} label={status.label} />
		</div>
	);
}
