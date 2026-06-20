import { Cake } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { WidgetCard } from "./WidgetCard";

type Birthday = { employee_code: string; name: string; day: number };

const AVATAR_TONES = [
	"bg-peach",
	"bg-lavender",
	"bg-mint",
	"bg-yellow",
	"bg-coral",
	"bg-sky",
];

function initials(name: string): string {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((p) => p.charAt(0).toUpperCase())
		.join("");
}

export function BirthdaysWidget({
	data,
}: {
	data: { birthdays?: Birthday[]; month?: string };
}) {
	const birthdays = data.birthdays ?? [];
	return (
		<WidgetCard title="Birthdays this month">
			{birthdays.length === 0 ? (
				<p className="text-small text-text-tertiary">No birthdays this month.</p>
			) : (
				<ul className="space-y-2.5">
					{birthdays.slice(0, 6).map((b, i) => (
						<li key={b.employee_code} className="flex items-center gap-2.5">
							<span
								className={`size-8 rounded-full grid place-items-center text-canvas text-small font-semibold shrink-0 ${AVATAR_TONES[i % AVATAR_TONES.length]}`}
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
								Send
							</Button>
						</li>
					))}
				</ul>
			)}
		</WidgetCard>
	);
}
