import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { MfaPrompt } from "@/components/hrms/MfaPrompt";
import { PageHeader } from "@/components/shell/PageHeader";
import { useCan } from "@/lib/perm";
import { roleApi } from "@/modules/admin/api";
import { teamApi } from "@/modules/admin/teams-api";

import {
	type DepartmentRef,
	type Employee,
	type EmployeeWritePayload,
	departmentApi,
	employeeApi,
} from "../api";
import { EmployeeForm } from "../components/EmployeeForm";

/** Turn a "snake_case" API field name into a readable label. */
function humanizeField(key: string): string {
	if (!key || key === "non_field") return "Error";
	return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Normalise an API error body into per-field messages + a non-field summary.
 *
 * The backend emits RFC 7807 problem+json where `errors` is a LIST of
 * `{ field, code, message }`. (A `field` of "non_field" means it isn't tied to
 * a specific input.) A legacy `{ field: msg | msg[] }` dict shape is also
 * tolerated so older responses keep working.
 */
function parseApiErrors(body: Record<string, unknown>): {
	fieldErrs: Record<string, string>;
	summary: string;
} {
	const fieldErrs: Record<string, string> = {};
	let summary = "";
	const append = (target: string, msg: string) => (target ? `${target} ${msg}` : msg);

	const raw = body.errors;
	if (Array.isArray(raw)) {
		for (const item of raw as Array<{ field?: string; message?: string }>) {
			const field = item.field ?? "non_field";
			const msg = item.message ?? "Invalid value";
			if (field === "non_field") summary = append(summary, msg);
			else fieldErrs[field] = append(fieldErrs[field] ?? "", msg);
		}
	} else if (raw && typeof raw === "object") {
		for (const [k, v] of Object.entries(raw as Record<string, string | string[]>)) {
			fieldErrs[k] = Array.isArray(v) ? v.join(" ") : String(v);
		}
	}
	return { fieldErrs, summary };
}

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
	const [roles, setRoles] = useState<{ code: string; name: string }[]>([]);
	const [loading, setLoading] = useState(true);
	const canProvision = useCan("user:create");
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
				const [emp, depts, ts, ems, rs] = await Promise.all([
					mode === "edit" && id ? employeeApi.retrieve(id) : Promise.resolve(null),
					departmentApi.list().catch(() => []),
					teamApi.list().catch(() => []),
					employeeApi.list().catch(() => []),
					roleApi.list().catch(() => []),
				]);
				if (cancelled) return;
				setInitial(emp);
				setDepartments(depts);
				setTeams(ts.map((t) => ({ id: t.id, name: t.name })));
				setRoles(rs.map((r) => ({ code: r.code, name: r.name })));
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

	async function performSave(payload: Partial<EmployeeWritePayload>, mfaCode?: string) {
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
			const { fieldErrs, summary } = parseApiErrors(body);
			setFieldErrors(fieldErrs);

			// Banner: prefer the non_field summary, then per-field messages, then
			// the problem `detail`, then a generic fallback.
			const fieldMsgs = Object.entries(fieldErrs).map(([k, m]) => `${humanizeField(k)}: ${m}`);
			const banner =
				summary ||
				(fieldMsgs.length ? fieldMsgs.join(" • ") : "") ||
				(typeof body.detail === "string" ? body.detail : "") ||
				"Could not save. Please check the form and try again.";
			setTopError(banner);

			// Toast stays concise but specific when there's a single clear cause.
			const firstMsg =
				summary ||
				fieldMsgs[0] ||
				(typeof body.detail === "string" ? body.detail : "Could not save");
			toast.error(firstMsg);
		} finally {
			setSaving(false);
		}
	}

	function handleSubmit(payload: Partial<EmployeeWritePayload>, replaced: Set<string>) {
		const bankReplaced = replaced.has("bank_account_number");
		if (mode === "edit" && bankReplaced) {
			setPendingMfa({ payload });
			return;
		}
		void performSave(payload);
	}

	function submitMfa(code: string) {
		if (!pendingMfa) return;
		void performSave(pendingMfa.payload, code).finally(() => setPendingMfa(null));
	}

	if (loading) return <p className="text-text-tertiary">Loading…</p>;

	return (
		<div className="space-y-4">
			<PageHeader
				breadcrumb="Employees"
				title={mode === "create" ? "New employee" : "Edit employee"}
				actions={
					<a href="/employees" className="text-small text-accent-200 hover:text-accent-50">
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
				roles={roles}
				canProvision={canProvision}
				onSubmit={handleSubmit}
				onCancel={() => nav(mode === "edit" && id ? `/employees/${id}` : "/employees")}
				fieldErrors={fieldErrors}
				topError={topError}
				saving={saving}
			/>

			{pendingMfa && <MfaPrompt onCancel={() => setPendingMfa(null)} onSubmit={submitMfa} />}
		</div>
	);
}
