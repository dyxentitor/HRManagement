import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";

import {
	type UnlinkedEmployee,
	type UnlinkedUser,
	settingsApi,
	unwrapResults,
} from "./settings-api";

export default function UsersLinkingPage() {
	const [users, setUsers] = useState<UnlinkedUser[]>([]);
	const [emps, setEmps] = useState<UnlinkedEmployee[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const [u, e] = await Promise.all([
				settingsApi.listUnlinkedUsers(),
				settingsApi.listUnlinkedEmployees(),
			]);
			setUsers(unwrapResults(u));
			setEmps(unwrapResults(e));
		} catch (ex: unknown) {
			setError(ex instanceof Error ? ex.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh().catch(() => undefined);
	}, [refresh]);

	async function link(empId: string, userId: string) {
		setError(null);
		try {
			await settingsApi.linkUser(empId, userId);
			await refresh();
		} catch (ex: unknown) {
			setError(ex instanceof Error ? ex.message : "Link failed");
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title="Users & Linking"
				subtitle={
					loading
						? "Loading…"
						: `${users.length} unlinked user${users.length === 1 ? "" : "s"} · ${emps.length} unlinked employee${emps.length === 1 ? "" : "s"}`
				}
			/>

			{error && (
				<div className="rounded-lg border border-coral/30 bg-coral/10 text-coral text-small p-3">
					{error}
				</div>
			)}

			<div className="grid grid-cols-2 gap-4">
				<Card title={`Unlinked users (${users.length})`}>
					{users.length === 0 ? (
						<Empty msg="All users are linked." />
					) : (
						users.map((u) => (
							<UnlinkedUserRow
								key={u.id}
								user={u}
								allEmps={emps}
								onLink={link}
							/>
						))
					)}
				</Card>
				<Card title={`Unlinked employees (${emps.length})`}>
					{emps.length === 0 ? (
						<Empty msg="All employees have a user account." />
					) : (
						emps.map((e) => (
							<UnlinkedEmpRow
								key={e.id}
								emp={e}
								allUsers={users}
								onLink={link}
							/>
						))
					)}
				</Card>
			</div>
		</div>
	);
}

function Card({
	title,
	children,
}: { title: string; children: React.ReactNode }) {
	return (
		<div className="rounded-lg border border-border-subtle bg-surface">
			<div className="px-3 py-2 border-b border-border-subtle text-label uppercase text-text-tertiary">
				{title}
			</div>
			<div className="flex flex-col">{children}</div>
		</div>
	);
}

function Empty({ msg }: { msg: string }) {
	return (
		<div className="p-4 text-small text-text-tertiary text-center">{msg}</div>
	);
}

interface OptionRow {
	id: string;
	label: string;
	suffix: string;
	suggested: boolean;
}

function pinSuggested(options: OptionRow[]): OptionRow[] {
	return options.slice().sort((a, b) => {
		if (a.suggested && !b.suggested) return -1;
		if (!a.suggested && b.suggested) return 1;
		return a.label.localeCompare(b.label);
	});
}

function UnlinkedUserRow({
	user,
	allEmps,
	onLink,
}: {
	user: UnlinkedUser;
	allEmps: UnlinkedEmployee[];
	onLink: (empId: string, userId: string) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const options: OptionRow[] = pinSuggested(
		allEmps.map((e) => ({
			id: e.id,
			label: `${e.first_name} ${e.last_name}`,
			suffix: e.employee_code,
			suggested: e.id === user.suggested_employee?.id,
		})),
	);

	return (
		<div
			data-row="unlinked-user"
			className="flex items-center justify-between p-3 border-b border-border-subtle last:border-b-0"
		>
			<div>
				<div className="text-body text-text-primary">{user.email}</div>
				<div className="text-small text-text-tertiary">
					{user.role_codes.join(", ") || "—"}
				</div>
			</div>
			<div className="relative">
				<Button type="button" size="sm" onClick={() => setOpen((o) => !o)}>
					Link <ChevronDown className="size-3 ml-1" />
				</Button>
				{open && (
					<div
						data-testid="link-options"
						className="absolute right-0 top-full mt-1 z-10 bg-surface-elevated border border-border-subtle rounded shadow-lg min-w-[260px] max-h-72 overflow-auto flex flex-col"
					>
						{options.length === 0 ? (
							<div className="px-3 py-2 text-small text-text-tertiary">
								No unlinked employees.
							</div>
						) : (
							options.map((opt) => (
								<button
									type="button"
									key={opt.id}
									data-testid="link-option"
									className="px-3 py-2 text-left hover:bg-accent-500/10 cursor-pointer text-small"
									onClick={async () => {
										setOpen(false);
										await onLink(opt.id, user.id);
									}}
								>
									{opt.label}{" "}
									<span className="text-text-tertiary">· {opt.suffix}</span>
									{opt.suggested && (
										<span className="ml-2 text-[10px] uppercase font-bold text-accent-200">
											suggested
										</span>
									)}
								</button>
							))
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function UnlinkedEmpRow({
	emp,
	allUsers,
	onLink,
}: {
	emp: UnlinkedEmployee;
	allUsers: UnlinkedUser[];
	onLink: (empId: string, userId: string) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const options: OptionRow[] = pinSuggested(
		allUsers.map((u) => ({
			id: u.id,
			label: u.email,
			suffix: u.role_codes.join(", ") || "—",
			suggested: u.id === emp.suggested_user?.id,
		})),
	);

	return (
		<div
			data-row="unlinked-employee"
			className="flex items-center justify-between p-3 border-b border-border-subtle last:border-b-0"
		>
			<div>
				<div className="text-body text-text-primary">
					{emp.first_name} {emp.last_name}
				</div>
				<div className="text-small text-text-tertiary">
					{emp.employee_code} · {emp.email}
				</div>
			</div>
			<div className="relative">
				<Button type="button" size="sm" onClick={() => setOpen((o) => !o)}>
					Link <ChevronDown className="size-3 ml-1" />
				</Button>
				{open && (
					<div
						data-testid="link-options"
						className="absolute right-0 top-full mt-1 z-10 bg-surface-elevated border border-border-subtle rounded shadow-lg min-w-[260px] max-h-72 overflow-auto flex flex-col"
					>
						{options.length === 0 ? (
							<div className="px-3 py-2 text-small text-text-tertiary">
								No unlinked users.
							</div>
						) : (
							options.map((opt) => (
								<button
									type="button"
									key={opt.id}
									data-testid="link-option"
									className="px-3 py-2 text-left hover:bg-accent-500/10 cursor-pointer text-small"
									onClick={async () => {
										setOpen(false);
										await onLink(emp.id, opt.id);
									}}
								>
									{opt.label}{" "}
									<span className="text-text-tertiary">· {opt.suffix}</span>
									{opt.suggested && (
										<span className="ml-2 text-[10px] uppercase font-bold text-accent-200">
											suggested
										</span>
									)}
								</button>
							))
						)}
					</div>
				)}
			</div>
		</div>
	);
}
