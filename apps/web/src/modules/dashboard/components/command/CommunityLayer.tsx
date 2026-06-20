import { Cake } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import type { AnnouncementItem, CompanyAnnouncementsData, Tone } from "../../api";

type Holiday = { date: string; name: string; type: string };
type Birthday = { employee_code: string; name: string; day: number };

const CAT_TONE: Record<string, Tone> = {
	policy: "lavender",
	event: "sky",
	maintenance: "yellow",
	holiday: "mint",
	general: "peach",
};
const CAT_EMOJI: Record<string, string> = {
	policy: "📋",
	event: "🎉",
	maintenance: "🛠️",
	holiday: "🏖️",
	general: "📣",
};
const HOLIDAY_TONE: Record<string, Tone> = {
	federal: "mint",
	state: "yellow",
	company: "lavender",
};
const AVATAR_TONES = ["bg-peach", "bg-lavender", "bg-mint", "bg-yellow", "bg-coral", "bg-sky"];
const THUMB_BG: Record<Tone, string> = {
	lavender: "bg-lavender/15",
	sky: "bg-sky/15",
	yellow: "bg-yellow/15",
	mint: "bg-mint/15",
	peach: "bg-peach/15",
	coral: "bg-coral/15",
};

function daysUntil(iso: string): number {
	const t = new Date();
	const todayUtc = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
	return Math.round((new Date(`${iso}T00:00:00Z`).getTime() - todayUtc) / 86_400_000);
}
function initials(name: string): string {
	return name.split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("");
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="rounded-xl p-5 border border-border-subtle bg-surface-hover">
			<h3 className="text-label font-semibold text-text-secondary mb-3">{title}</h3>
			{children}
		</div>
	);
}

export interface CommunityLayerProps {
	announcements?: CompanyAnnouncementsData;
	/** the featured one is shown in the hero, so it's excluded here */
	featuredId?: string;
	holidays: Holiday[];
	birthdays: Birthday[];
}

export function CommunityLayer({
	announcements,
	featuredId,
	holidays,
	birthdays,
}: CommunityLayerProps) {
	const anns: AnnouncementItem[] = (announcements?.items ?? []).filter(
		(a) => a.id !== featuredId,
	);
	const hasAny = anns.length || holidays.length || birthdays.length;
	if (!hasAny) return null;

	return (
		<section>
			<p className="layer-eyebrow mb-2">Layer 4 · Company &amp; community</p>
			<div className="grid lg:grid-cols-[1.5fr_1fr_1fr] gap-4">
				{announcements && (
					<Panel title="Announcements">
						{anns.length === 0 ? (
							<p className="text-small text-text-tertiary">No announcements.</p>
						) : (
							<ul>
								{anns.map((a) => (
									<li
										key={a.id}
										className="flex gap-3 py-3 border-t border-border-subtle first:border-t-0"
									>
										<span
											className={`size-12 rounded-xl grid place-items-center text-xl shrink-0 ${THUMB_BG[CAT_TONE[a.category] ?? "peach"]}`}
											aria-hidden
										>
											{CAT_EMOJI[a.category] ?? "📣"}
										</span>
										<div className="min-w-0 flex-1">
											<StatusPill tone={CAT_TONE[a.category] ?? "peach"} label={a.category} />
											<p className="text-small text-text-primary mt-1.5 truncate">
												{a.title}
											</p>
											<p className="text-small text-text-tertiary">
												{new Date(a.published_at).toLocaleDateString("en-MY")}
											</p>
										</div>
									</li>
								))}
							</ul>
						)}
					</Panel>
				)}

				<Panel title="Upcoming holidays">
					{holidays.length === 0 ? (
						<p className="text-small text-text-tertiary">No upcoming holidays.</p>
					) : (
						<ul>
							{holidays.map((h) => {
								const d = daysUntil(h.date);
								const remain = d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `in ${d} days`;
								const dt = new Date(`${h.date}T00:00:00Z`);
								return (
									<li
										key={h.date}
										className="flex items-center gap-3 py-2 border-t border-border-subtle first:border-t-0"
									>
										<div className="w-11 shrink-0 text-center border border-border-subtle rounded-lg py-1 bg-canvas/30">
											<span className="block text-h3 leading-none text-text-primary">
												{dt.getUTCDate()}
											</span>
											<span className="text-[9px] uppercase text-text-tertiary">
												{dt.toLocaleDateString("en-MY", { month: "short", timeZone: "UTC" })}
											</span>
										</div>
										<div className="min-w-0 flex-1">
											<p className="text-small text-text-primary truncate">{h.name}</p>
											<p className="text-small text-text-tertiary">{remain}</p>
										</div>
										<StatusPill tone={HOLIDAY_TONE[h.type.toLowerCase()] ?? "peach"} label={h.type} />
									</li>
								);
							})}
						</ul>
					)}
				</Panel>

				<Panel title="Birthdays">
					{birthdays.length === 0 ? (
						<p className="text-small text-text-tertiary">No birthdays this month.</p>
					) : (
						<ul>
							{birthdays.slice(0, 5).map((b, i) => (
								<li
									key={b.employee_code}
									className="flex items-center gap-2.5 py-2 border-t border-border-subtle first:border-t-0"
								>
									<span
										className={`size-8 rounded-full grid place-items-center text-canvas text-small font-bold shrink-0 ${AVATAR_TONES[i % AVATAR_TONES.length]}`}
										aria-hidden
									>
										{initials(b.name)}
									</span>
									<div className="min-w-0 flex-1">
										<p className="text-small text-text-primary truncate">{b.name}</p>
										<p className="text-small text-text-tertiary">Day {b.day}</p>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="gap-1.5 text-accent-200"
										onClick={() => toast.success(`Birthday wishes sent to ${b.name}`)}
									>
										<Cake className="size-3.5" aria-hidden />
										Wish
									</Button>
								</li>
							))}
						</ul>
					)}
				</Panel>
			</div>
		</section>
	);
}
