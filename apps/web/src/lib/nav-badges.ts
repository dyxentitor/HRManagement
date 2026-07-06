import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth";
import { announcementsApi } from "@/modules/announcements/api";
import { getInbox } from "@/modules/approvals/api";
import { assignmentsApi } from "@/modules/assignments/api";

export interface NavBadges {
	approvals?: number;
	actionCenter?: number;
	announcements?: number;
}

/**
 * Live counts for the sidebar Inbox zone. Best-effort: fetched once when the shell
 * mounts, failures are swallowed (a badge simply doesn't show). Approvals is only
 * fetched when the user can read the approvals inbox.
 */
export function useNavBadges(): NavBadges {
	const { perms } = useAuth();
	const canApprovals = Boolean(perms?.has("approvals:inbox:read"));
	const [badges, setBadges] = useState<NavBadges>({});

	useEffect(() => {
		let alive = true;

		assignmentsApi
			.myAssignments()
			.then((rows) => {
				if (alive)
					setBadges((b) => ({
						...b,
						actionCenter: rows.filter((r) => r.status !== "completed").length,
					}));
			})
			.catch(() => {});

		if (canApprovals) {
			getInbox()
				.then((items) => {
					if (alive) setBadges((b) => ({ ...b, approvals: items.length }));
				})
				.catch(() => {});
		}

		announcementsApi
			.unreadCount()
			.then((count) => {
				if (alive) setBadges((b) => ({ ...b, announcements: count }));
			})
			.catch(() => {});

		return () => {
			alive = false;
		};
	}, [canApprovals]);

	return badges;
}
