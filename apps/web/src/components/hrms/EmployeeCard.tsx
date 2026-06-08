import { Eye, Mail, Pencil, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ProgressBar } from "./ProgressBar";

export interface EmployeeCardProps {
	employee: {
		id: string;
		full_name: string;
		role_title?: string;
		email?: string;
		phone?: string;
		photo_url?: string | null;
	};
	metric: { label: string; value: number; max?: number };
	gradient?: [string, string];
	onView?: (id: string) => void;
	onMail?: (email: string) => void;
	onCall?: (phone: string) => void;
	onEdit?: (id: string) => void;
}

const PALETTES: [string, string][] = [
	["peach", "coral"],
	["lavender", "sky"],
	["mint", "yellow"],
	["yellow", "peach"],
	["sky", "lavender"],
];

function gradientFromName(name: string): [string, string] {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	}
	return PALETTES[hash % PALETTES.length] ?? ["lavender", "sky"];
}

export function EmployeeCard({
	employee,
	metric,
	gradient,
	onView,
	onMail,
	onCall,
	onEdit,
}: EmployeeCardProps) {
	const [from, to] = gradient ?? gradientFromName(employee.full_name);
	const max = metric.max ?? 100;
	const pct = Math.round((metric.value / max) * 100);

	return (
		<article className="bg-surface-hover border border-border-subtle rounded-lg p-4 text-center">
			{employee.photo_url ? (
				<img
					src={employee.photo_url}
					alt={`${employee.full_name} avatar`}
					className="size-14 rounded-full object-cover mx-auto mb-2 border-2 border-accent-500/30"
				/>
			) : (
				<div
					className={cn(
						"size-14 rounded-full mx-auto mb-2 bg-gradient-to-br border-2 border-accent-500/30",
						`from-${from}`,
						`to-${to}`,
					)}
					aria-hidden
				/>
			)}
			<h3 className="text-h3 text-text-primary">{employee.full_name}</h3>
			{employee.role_title && (
				<span className="inline-block mt-1 mb-2 px-2 py-0.5 rounded-full bg-accent-500/15 text-accent-200 text-small">
					{employee.role_title}
				</span>
			)}
			<div className="flex flex-wrap justify-center gap-1.5 mb-3">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5 rounded-md bg-canvas border border-border-subtle px-2.5 text-small text-text-secondary hover:text-accent-200"
					aria-label="Email"
					disabled={!employee.email}
					onClick={() => employee.email && onMail?.(employee.email)}
				>
					<Mail /> Email
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5 rounded-md bg-canvas border border-border-subtle px-2.5 text-small text-text-secondary hover:text-accent-200"
					aria-label="Call"
					disabled={!employee.phone}
					onClick={() => employee.phone && onCall?.(employee.phone)}
				>
					<Phone /> Call
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5 rounded-md bg-canvas border border-border-subtle px-2.5 text-small text-text-secondary hover:text-accent-200"
					aria-label="View profile"
					onClick={() => onView?.(employee.id)}
				>
					<Eye /> View
				</Button>
				{onEdit && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-8 gap-1.5 rounded-md bg-canvas border border-border-subtle px-2.5 text-small text-text-secondary hover:text-accent-200"
						aria-label="Edit"
						onClick={() => onEdit(employee.id)}
					>
						<Pencil /> Edit
					</Button>
				)}
			</div>
			<ProgressBar
				label={`${metric.label} · ${pct}%`}
				value={metric.value}
				max={max}
				gradient={[from, to]}
				showValue={false}
			/>
		</article>
	);
}
