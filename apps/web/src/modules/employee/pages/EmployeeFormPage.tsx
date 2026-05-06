import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { MfaPrompt } from "@/components/hrms/MfaPrompt";
import { PageHeader } from "@/components/shell/PageHeader";
import { teamApi } from "@/modules/admin/teams-api";

import {
	type DepartmentRef,
	type Employee,
	type EmployeeWritePayload,
	departmentApi,
	employeeApi,
} from "../api";
import { EmployeeForm } from "../components/EmployeeForm";

export default function EmployeeFormPage() {
	const { id } = useParams<{ id: string }>();
	const mode: "create" | "edit" = id ? "edit" : "create";
	const nav = useNavigate();

	const [initial, setInitial] = useState<Employee | null>(null);
	const [departments, setDepartments] = useState<DepartmentRef[]>([]);
	const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
	const [managers, setManagers] = useState<
		{ id: string; full_name: string; role_title?: string }[]
	>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [topError, setTopError] = useState<string | undefined>(undefined);
	const [pendingMfa, setPendingMfa] = useState<{
		payload: Partial<EmployeeWritePayload>;
	} | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);

		(async () => {
			try {
				const [emp, depts, ts, ems] = await Promise.all([
					mode === "edit" && id
						? employeeApi.retrieve(id)
						: Promise.resolve(null),
					departmentApi.list().catch(() => []),
					teamApi.list().catch(() => []),
					employeeApi.list().catch(() => []),
				]);
				if (cancelled) return;
				setInitial(emp);
				setDepartments(depts);
				setTeams(ts.map((t) => ({ id: t.id, name: t.name })));
				setManagers(
					ems.map((e) => ({
						id: e.id,
						full_name: e.full_name,
						role_title: e.role_title,
					})),
				);
			} catch {
				toast.error("Could not load form data");
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [mode, id]);

	async function performSave(
		payload: Partial<EmployeeWritePayload>,
		mfaCode?: string,
	) {
		setSaving(true);
		setFieldErrors({});
		setTopError(undefined);
		try {
			if (mode === "create") {
				const res = await employeeApi.create(payload as EmployeeWritePayload);
				toast.success("Employee created");
				nav(`/employees/${res.id}`);
			} else if (id) {
				await employeeApi.update(id, payload, mfaCode);
				toast.success("Employee updated");
				nav(`/employees/${id}`);
			}
		} catch (err) {
			const e = err as { body?: Record<string, unknown> };
			const body = e.body ?? {};
			const errs = (body.errors ?? body) as Record<string, string | string[]>;
			const flat: Record<string, string> = {};
			for (const [k, v] of Object.entries(errs)) {
				flat[k] = Array.isArray(v) ? v.join(" ") : String(v);
			}
			setFieldErrors(flat);
			setTopError(
				typeof body.detail === "string" ? body.detail : "Save failed",
			);
			toast.error("Could not save");
		} finally {
			setSaving(false);
		}
	}

	function handleSubmit(
		payload: Partial<EmployeeWritePayload>,
		replaced: Set<string>,
	) {
		const bankReplaced = replaced.has("bank_account_number");
		if (mode === "edit" && bankReplaced) {
			setPendingMfa({ payload });
			return;
		}
		void performSave(payload);
	}

	function submitMfa(code: string) {
		if (!pendingMfa) return;
		void performSave(pendingMfa.payload, code).finally(() =>
			setPendingMfa(null),
		);
	}

	if (loading) return <p className="text-text-tertiary">Loading…</p>;

	return (
		<div className="space-y-4">
			<PageHeader
				breadcrumb="Employees"
				title={mode === "create" ? "New employee" : "Edit employee"}
				actions={
					<a
						href="/employees"
						className="text-small text-accent-200 hover:text-accent-50"
					>
						← All employees
					</a>
				}
			/>

			<EmployeeForm
				mode={mode}
				initial={initial}
				departments={departments}
				teams={teams}
				managerOptions={managers}
				onSubmit={handleSubmit}
				onCancel={() =>
					nav(mode === "edit" && id ? `/employees/${id}` : "/employees")
				}
				fieldErrors={fieldErrors}
				topError={topError}
				saving={saving}
			/>

			{pendingMfa && (
				<MfaPrompt onCancel={() => setPendingMfa(null)} onSubmit={submitMfa} />
			)}
		</div>
	);
}
