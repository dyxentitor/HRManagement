type Cert = { employee_id: string; name: string; expires_on: string | null };
type Props = { data: Record<string, unknown> };

export function CertsExpiringCard({ data }: Props) {
	const certs = (data.certs as Cert[]) ?? [];
	return (
		<div className="bg-white border rounded p-4">
			<h3 className="font-semibold text-sm text-slate-700 mb-2">
				Team Certs Expiring (60d)
			</h3>
			{certs.length === 0 ? (
				<p className="text-xs text-slate-500">No certs expiring soon.</p>
			) : (
				<ul className="space-y-1">
					{certs.map((c) => (
						<li
							key={`${c.employee_id}-${c.name}`}
							className="text-xs flex justify-between"
						>
							<span className="truncate">{c.name}</span>
							<span className="text-slate-500 ml-2">{c.expires_on ?? "—"}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
