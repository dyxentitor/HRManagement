import { ArchiveRestore } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";

import {
	type ArchivedEmployee,
	settingsApi,
	unwrapResults,
} from "./settings-api";

export default function ArchivedEmployeesPage() {
	const [rows, setRows] = useState<ArchivedEmployee[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const body = await settingsApi.listArchivedEmployees();
			setRows(unwrapResults(body));
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh().catch(() => undefined);
	}, [refresh]);

	async function restore(id: string) {
		setError(null);
		try {
			await settingsApi.restoreEmployee(id);
			setRows((r) => r.filter((row) => row.id !== id));
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Restore failed");
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title="Archived Employees"
				subtitle={
					loading
						? "Loading…"
						: `${rows.length} archived employee${rows.length === 1 ? "" : "s"}`
				}
			/>

			{error && (
				<div className="rounded-lg border border-coral/30 bg-coral/10 text-coral text-small p-3">
					{error}
				</div>
			)}

			<div className="rounded-lg border border-border-subtle bg-surface overflow-hidden">
				{rows.length === 0 && !loading ? (
					<div className="p-6 text-center text-text-secondary text-small">
						No archived employees.
					</div>
				) : (
					rows.map((e) => (
						<div
							key={e.id}
							data-row="archived"
							className="flex items-center justify-between p-3 border-b border-border-subtle last:border-b-0"
						>
							<div>
								<div className="text-body text-text-primary">
									{e.first_name} {e.last_name}
								</div>
								<div className="text-small text-text-tertiary">
									{e.email} · archived{" "}
									{new Date(e.deleted_at).toLocaleDateString()}
								</div>
							</div>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() => restore(e.id)}
								aria-label={`Restore ${e.first_name} ${e.last_name}`}
							>
								<ArchiveRestore className="size-3.5 mr-1" /> Restore
							</Button>
						</div>
					))
				)}
			</div>
		</div>
	);
}
