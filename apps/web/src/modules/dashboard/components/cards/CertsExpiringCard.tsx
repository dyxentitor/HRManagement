import { StatusPill } from "@/components/hrms";

type Cert = { employee_id: string; name: string; expires_on: string | null };
type Props = { data: Record<string, unknown> };

function isUrgent(expiresOn: string | null): boolean {
	if (!expiresOn) return false;
	const diff = new Date(expiresOn).getTime() - Date.now();
	return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000; // within 30 days
}

export function CertsExpiringCard({ data }: Props) {
	const certs = (data.certs as Cert[]) ?? [];
	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h3 className="text-label font-semibold text-text-secondary mb-3">
				Team Certs Expiring (60d)
			</h3>
			{certs.length === 0 ? (
				<p className="text-small text-text-tertiary">No certs expiring soon.</p>
			) : (
				<ul className="space-y-2">
					{certs.map((c) => (
						<li
							key={`${c.employee_id}-${c.name}`}
							className="text-small flex justify-between items-center gap-2"
						>
							<span className="text-text-primary truncate">{c.name}</span>
							<div className="flex items-center gap-2 shrink-0">
								{isUrgent(c.expires_on) && (
									<StatusPill tone="coral" label="Soon" />
								)}
								<span className="text-text-tertiary">
									{c.expires_on ?? "—"}
								</span>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
