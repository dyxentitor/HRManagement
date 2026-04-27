import type { ReactNode } from "react";

import { useCan } from "@/lib/perm";

export function RouteGuard({
	perms,
	children,
}: { perms: string[]; children: ReactNode }) {
	const allowed = useCan(perms);
	if (!allowed) {
		return (
			<main className="min-h-screen flex items-center justify-center">
				<p>You don&apos;t have permission to view this page.</p>
			</main>
		);
	}
	return <>{children}</>;
}
