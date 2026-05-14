import { UserPlus } from "lucide-react";

const COPY: Record<string, { what: string }> = {
	profile: { what: "your profile" },
	schedule: { what: "your schedule or attendance" },
	leave: { what: "your leave requests" },
	claims: { what: "your claims" },
};

interface Props {
	scope: keyof typeof COPY;
}

/** Shared empty-state card shown on `/me/*` pages when the logged-in user
 * has no Employee record yet. Replaces the bare paragraph that used to live
 * inline on those pages (v1.9.0).
 */
export function NotLinkedEmptyState({ scope }: Props) {
	const what = COPY[scope]?.what ?? "this page";
	return (
		<div className="max-w-md mx-auto mt-12 p-6 rounded-lg border border-border-subtle bg-surface flex flex-col gap-3">
			<div className="w-10 h-10 rounded-full bg-accent-500/15 flex items-center justify-center">
				<UserPlus className="size-5 text-accent-200" aria-hidden />
			</div>
			<h2 className="text-h3 font-bold text-text-primary">
				Account not linked to an employee
			</h2>
			<p className="text-body text-text-secondary">
				Your account isn't linked to an employee record yet, so we can't show{" "}
				{what}. Ask HR to create or link your employee record — once they do,
				this page will work normally.
			</p>
		</div>
	);
}
