type Birthday = { employee_code: string; name: string; day: number };
type Props = { data: Record<string, unknown> };

export function BirthdaysCard({ data }: Props) {
	const birthdays = (data.birthdays as Birthday[]) ?? [];
	const month = data.month as string;
	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h3 className="text-label font-semibold text-text-secondary mb-3">
				Birthdays — {month}
			</h3>
			{birthdays.length === 0 ? (
				<p className="text-small text-text-tertiary">
					No birthdays this month.
				</p>
			) : (
				<ul className="space-y-2">
					{birthdays.map((b) => (
						<li
							key={b.employee_code}
							className="text-small flex justify-between items-center"
						>
							<span className="text-text-primary">{b.name}</span>
							<span className="text-text-tertiary">Day {b.day}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
