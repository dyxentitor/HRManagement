type Birthday = { employee_code: string; name: string; day: number };
type Props = { data: Record<string, unknown> };

export function BirthdaysCard({ data }: Props) {
	const birthdays = (data.birthdays as Birthday[]) ?? [];
	const month = data.month as string;
	return (
		<div className="bg-white border rounded p-4">
			<h3 className="font-semibold text-sm text-slate-700 mb-2">
				Birthdays — {month}
			</h3>
			{birthdays.length === 0 ? (
				<p className="text-xs text-slate-500">No birthdays this month.</p>
			) : (
				<ul className="space-y-1">
					{birthdays.map((b) => (
						<li key={b.employee_code} className="text-xs flex justify-between">
							<span>{b.name}</span>
							<span className="text-slate-500">Day {b.day}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
