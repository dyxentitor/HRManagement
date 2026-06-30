import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useCan } from "@/lib/perm";

import { type RoleSummary, roleApi } from "../api";

interface Props {
	userId: string;
	currentRoles: string[];
	/** Retained for API compatibility; assignment now lives in the role's Members tab. */
	onChange?: (roles: string[]) => void;
}

/**
 * Read-only view of a person's roles. Editing happens in the role-centric Members tab
 * (`/admin/settings/roles/:code`) so there is a single source of truth for assignment.
 */
export function RolesCard({ currentRoles }: Props) {
	const canManage = useCan("role:write");
	const [roles, setRoles] = useState<RoleSummary[]>([]);

	useEffect(() => {
		roleApi
			.list()
			.then(setRoles)
			.catch(() => {
				// silent — chips fall back to role codes if the list fails
			});
	}, []);

	const nameOf = (code: string) => roles.find((r) => r.code === code)?.name ?? code;

	return (
		<section className="bg-surface rounded-lg p-4">
			<div className="flex items-center justify-between mb-3">
				<h2 className="text-h2 font-semibold">Roles</h2>
				{canManage && (
					<Link
						to="/admin/settings/roles"
						className="inline-flex items-center gap-1 text-small text-accent-300 hover:text-accent-200"
					>
						Manage in Roles <ExternalLink className="size-3" />
					</Link>
				)}
			</div>
			{currentRoles.length === 0 ? (
				<span className="text-text-tertiary text-small">No roles assigned.</span>
			) : (
				<div className="flex flex-wrap gap-2">
					{currentRoles.map((code) =>
						canManage ? (
							<Link
								key={code}
								to={`/admin/settings/roles/${code}`}
								className="inline-flex items-center rounded-full bg-canvas border border-border-subtle px-2.5 py-1 text-small hover:border-accent-500/40"
							>
								{nameOf(code)}
							</Link>
						) : (
							<span
								key={code}
								className="inline-flex items-center rounded-full bg-canvas border border-border-subtle px-2.5 py-1 text-small"
							>
								{nameOf(code)}
							</span>
						),
					)}
				</div>
			)}
		</section>
	);
}
