interface Props {
  holidays: { date: string; name: string }[]
  todayIso: string
}

/** Rail card — the next four public holidays. Replaces the old in-page block. */
export function UpcomingHolidaysCard({ holidays, todayIso }: Props) {
  const rows = holidays
    .filter((h) => h.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)

  return (
    <section className="glass-surface rounded-2xl p-4">
      <h2 className="text-label uppercase text-text-tertiary mb-2">Upcoming holidays</h2>
      {rows.length === 0 ? (
        <p className="text-small text-text-tertiary">No upcoming public holidays.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((h) => {
            const d = new Date(`${h.date}T00:00:00Z`)
            return (
              <li
                key={`${h.date}-${h.name}`}
                data-testid="upcoming-holiday-row"
                className="flex items-center gap-3 py-2 border-b border-border-subtle last:border-0"
              >
                <span className="text-center min-w-[2.25rem] rounded-lg bg-peach/10 px-1.5 py-1">
                  <span className="block text-body font-bold leading-none text-peach">
                    {d.getUTCDate()}
                  </span>
                  <span className="block text-label uppercase text-peach/70">
                    {d.toLocaleDateString("en-MY", { month: "short", timeZone: "UTC" })}
                  </span>
                </span>
                <span className="text-small text-text-primary truncate">{h.name}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
