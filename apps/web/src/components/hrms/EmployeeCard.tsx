import { ArrowUpRight, Copy, Pencil } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { tenureFromHireDate } from "@/modules/employee/lib/format";

import { StatusPill } from "./StatusPill";

export interface EmployeeCardProps {
	employee: {
		id: string;
		full_name: string;
		role_title?: string;
		email?: string;
		phone?: string;
		photo_url?: string | null;
		status?: string;
		hire_date?: string;
		department_name?: string;
	};
	onView?: (id: string) => void;
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
	for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	return PALETTES[hash % PALETTES.length] ?? ["lavender", "sky"];
}

type Tone = "mint" | "yellow" | "coral" | "sky" | "lavender" | "peach";

const STATUS_TONES: Record<string, { tone: Tone; label: string }> = {
	active: { tone: "mint", label: "Active" },
	probation: { tone: "yellow", label: "Probation" },
	on_leave: { tone: "sky", label: "On leave" },
	suspended: { tone: "coral", label: "Suspended" },
	inactive: { tone: "lavender", label: "Inactive" },
	terminated: { tone: "lavender", label: "Terminated" },
};

function statusTone(status?: string): { tone: Tone; label: string } {
	if (!status) return { tone: "mint", label: "Active" };
	return (
		STATUS_TONES[status] ?? {
			tone: "lavender",
			label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
		}
	);
}

async function copyValue(value: string, kind: "Email" | "Phone") {
	try {
		await navigator.clipboard?.writeText(value);
		toast.success(`${kind} copied`);
	} catch {
		/* clipboard unavailable — no-op */
	}
}

export function EmployeeCard({ employee, onView, onEdit }: EmployeeCardProps) {
	const [from, to] = gradientFromName(employee.full_name);
	const status = statusTone(employee.status);

	return (
		<article className="glass-surface rounded-2xl p-[18px] relative">
			<div className="absolute top-3 right-3 flex gap-1.5">
				{onEdit && (
					<button
						type="button"
						aria-label="Edit"
						onClick={() => onEdit(employee.id)}
						className="size-7 grid place-items-center rounded-lg bg-white/5 border border-border-subtle text-text-secondary hover:text-accent-200"
					>
						<Pencil className="size-3.5" />
					</button>
				)}
				<button
					type="button"
					aria-label="View profile"
					onClick={() => onView?.(employee.id)}
					className="size-7 grid place-items-center rounded-lg bg-accent-500/15 border border-accent-500/25 text-accent-200 hover:text-accent-50"
				>
					<ArrowUpRight className="size-3.5" />
				</button>
			</div>

			<div className="flex justify-center mt-1 mb-2.5">
				{employee.photo_url ? (
					<img
						src={employee.photo_url}
						alt={`${employee.full_name} avatar`}
						className="size-[78px] rounded-full object-cover border-[3px] border-accent-500/30"
					/>
				) : (
					<div
						aria-hidden
						className={cn(
							"size-[78px] rounded-full bg-gradient-to-br border-[3px] border-accent-500/30",
							`from-${from}`,
							`to-${to}`,
						)}
					/>
				)}
			</div>

			<h3 className="text-h3 text-text-primary text-center">{employee.full_name}</h3>
			{employee.role_title && (
				<p className="text-small text-text-tertiary text-center mt-0.5">{employee.role_title}</p>
			)}
			<div className="flex justify-center my-3">
				<StatusPill tone={status.tone} label={status.label} />
			</div>

			<dl className="bg-black/20 rounded-xl px-3.5 py-1">
				<CopyRow label="Email" value={employee.email} kind="Email" />
				<CopyRow label="Phone" value={employee.phone} kind="Phone" />
				<Row label="Department" value={employee.department_name ?? "—"} />
				<Row label="Tenure" value={tenureFromHireDate(employee.hire_date) || "—"} />
			</dl>
		</article>
	);
}

const ROW =
	"flex justify-between items-center text-small py-[7px] border-b border-white/5 last:border-b-0";

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className={ROW}>
			<dt className="text-text-tertiary">{label}</dt>
			<dd className="text-text-primary font-medium">{value}</dd>
		</div>
	);
}

function CopyRow({
	label,
	value,
	kind,
}: { label: string; value?: string; kind: "Email" | "Phone" }) {
	return (
		<div className={ROW}>
			<dt className="text-text-tertiary">{label}</dt>
			<dd>
				{value ? (
					<button
						type="button"
						aria-label={`Copy ${kind.toLowerCase()}`}
						onClick={() => copyValue(value, kind)}
						className="group inline-flex items-center gap-1.5 text-text-primary font-medium rounded-md px-1 -mx-1 hover:bg-accent-500/[0.12]"
					>
						{value} <Copy className="size-3 opacity-40 group-hover:opacity-100" />
					</button>
				) : (
					<span className="text-text-tertiary">—</span>
				)}
			</dd>
		</div>
	);
}
