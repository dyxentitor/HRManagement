import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
	type Column,
	DataTable,
	EmployeeCard,
	EmptyState,
	StatusPill,
} from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/perm";

import { type Employee, employeeApi } from "../api";

type View = "cards" | "table";

const tableColumns: Column<Employee>[] = [
	{ key: "name", header: "Name", render: (r) => r.full_name },
	{ key: "role", header: "Role", render: (r) => r.role_title ?? "—" },
	{
		key: "dept",
		header: "Department",
		render: (r) => r.department_name ?? r.department_id ?? "—",
	},
	{
		key: "attn",
		header: "Attendance",
		render: (r) => (
			<StatusPill tone="mint" label={`${r.attendance_pct ?? 0}%`} />
		),
		align: "right",
	},
];

export default function EmployeesPage() {
	const canAdd = useCan("employee:create");
	const navigate = useNavigate();
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [view, setView] = useState<View>("cards");
	const [dept, setDept] = useState<string>("");

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		employeeApi
			.list()
			.then((rows) => {
				if (!cancelled) {
					setEmployees(rows);
					setLoading(false);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(
						err instanceof Error ? err.message : "Could not load employees",
					);
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const filtered = useMemo(() => {
		if (!dept) return employees;
		return employees.filter((e) => e.department_id === dept);
	}, [employees, dept]);

	const departments = useMemo(() => {
		const map = new Map<string, string>();
		for (const e of employees) {
			if (e.department_id) {
				map.set(e.department_id, e.department_name ?? e.department_id);
			}
		}
		return [...map.entries()];
	}, [employees]);

	return (
		<div className="space-y-6">
			<PageHeader
				title="Employees"
				subtitle={
					loading ? "Loading…" : `${filtered.length} of ${employees.length}`
				}
				actions={
					canAdd ? (
						<Button
							type="button"
							onClick={() => navigate("/employees/new")}
							className="bg-accent-500 hover:bg-accent-600 text-white"
						>
							<Plus className="size-4 mr-1" /> Add employee
						</Button>
					) : null
				}
			/>

			{error && (
				<p className="text-coral text-small" role="alert">
					{error}
				</p>
			)}

			<div className="flex flex-wrap items-center gap-2">
				<select
					value={dept}
					onChange={(e) => setDept(e.target.value)}
					aria-label="Department"
					className="bg-canvas border border-border-subtle rounded-md px-3 py-1.5 text-body text-text-secondary"
				>
					<option value="">All departments</option>
					{departments.map(([id, name]) => (
						<option key={id} value={id}>
							{name}
						</option>
					))}
				</select>
				<div className="ml-auto flex gap-1 rounded-md bg-canvas border border-border-subtle p-0.5">
					<Button
						type="button"
						size="sm"
						variant={view === "cards" ? "default" : "ghost"}
						onClick={() => setView("cards")}
						aria-label="Card view"
					>
						Cards
					</Button>
					<Button
						type="button"
						size="sm"
						variant={view === "table" ? "default" : "ghost"}
						onClick={() => setView("table")}
						aria-label="Table view"
					>
						Table
					</Button>
				</div>
			</div>

			{!loading && filtered.length === 0 ? (
				<EmptyState
					icon="🌴"
					title="No employees here"
					description={
						dept
							? "Try a different department filter."
							: "Add your first employee to get started."
					}
				/>
			) : view === "cards" ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
					{filtered.map((e) => (
						<button
							key={e.id}
							type="button"
							onClick={() => navigate(`/employees/${e.id}`)}
							className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-xl"
						>
							<EmployeeCard
								employee={e}
								metric={{
									label: "Attendance",
									value: e.attendance_pct ?? 0,
									max: 100,
								}}
							/>
						</button>
					))}
				</div>
			) : (
				<DataTable<Employee>
					rows={filtered}
					columns={tableColumns}
					rowKey={(e) => e.id}
				/>
			)}
		</div>
	);
}
