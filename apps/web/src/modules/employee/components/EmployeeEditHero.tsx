import { Hash, Mail, Phone } from "lucide-react";

import { StatusPill } from "@/components/hrms";
import { cn } from "@/lib/utils";

import type { Employee } from "../api";
import { AvatarUpload } from "./AvatarUpload";

function humanize(s: string): string {
	return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Chip({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1.5 text-small text-text-secondary glass-surface rounded-full px-2.5 py-1 max-w-full">
			<Icon className="size-3.5 text-text-tertiary shrink-0" aria-hidden />
			<span className="truncate">{children}</span>
		</span>
	);
}

/**
 * Profile summary hero for the employee edit page — context before editing.
 * Avatar (uploadable), identity, quick chips, and profile completeness.
 */
export function EmployeeEditHero({
	employee,
	onPhotoChange,
}: {
	employee: Employee;
	onPhotoChange: () => void;
}) {
	const pct = employee.profile_completeness?.percent ?? null;
	const missing = (employee.profile_completeness?.missing ?? []).map(humanize);
	const complete = pct === null || pct >= 100;

	return (
		<section className="relative overflow-hidden rounded-lg border border-border-subtle bg-surface-hover p-5">
			{/* subtle accent wash, consistent with the page's one card language */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					background:
						"radial-gradient(520px 180px at 0% 0%, rgb(124 92 255 / 0.14), transparent 65%)",
				}}
				aria-hidden
			/>
			<div className="relative z-10 flex flex-wrap items-center gap-4">
				<AvatarUpload
					photoUrl={employee.photo_url ?? null}
					fullName={employee.full_name}
					size="lg"
					uploadFor={{ kind: "employee", id: employee.id }}
					onUploaded={onPhotoChange}
					onDeleted={onPhotoChange}
				/>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2.5 flex-wrap">
						<h1 className="text-h2 text-text-primary">{employee.full_name}</h1>
						{employee.status && (
							<StatusPill
								tone={employee.status === "active" ? "mint" : "coral"}
								label={employee.status}
							/>
						)}
					</div>
					<p className="text-body text-text-secondary mt-0.5">
						{employee.role_title || "—"}
						{employee.department_name ? ` · ${employee.department_name}` : ""}
					</p>
					<div className="flex flex-wrap items-center gap-2 mt-2.5">
						{employee.employee_code && <Chip icon={Hash}>{employee.employee_code}</Chip>}
						{employee.email && <Chip icon={Mail}>{employee.email}</Chip>}
						{employee.phone && <Chip icon={Phone}>{employee.phone}</Chip>}
					</div>
				</div>
			</div>

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
