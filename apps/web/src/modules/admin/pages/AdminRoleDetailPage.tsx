import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { type RoleDetail, roleApi } from "../api";
import { groupPermissions } from "../lib/permission-catalogue";

export default function AdminRoleDetailPage() {
	const { code } = useParams<{ code: string }>();
	const navigate = useNavigate();
	const [role, setRole] = useState<RoleDetail | null>(null);
	const [draft, setDraft] = useState<Set<string>>(new Set());
	const [allKnownCodes, setAllKnownCodes] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [resetArmed, setResetArmed] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		if (!code) return;
		setLoading(true);
		roleApi
			.retrieve(code)
			.then((r) => {
				setRole(r);
				setDraft(new Set(r.permissions));
				// Seed catalogue with this role's permissions; other roles
				// contribute codes through subsequent visits. This avoids
				// an extra network call.
				// TODO: future GET /api/v1/org/permissions/ endpoint
				setAllKnownCodes((prev) =>
					Array.from(new Set([...prev, ...r.permissions])),
				);
			})
			.catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"))
			.finally(() => setLoading(false));
	}, [code]);

	const groups = useMemo(
		() => groupPermissions(allKnownCodes),
		[allKnownCodes],
	);

	if (loading) return <div>Loading…</div>;
	if (err) return <div className="text-error">{err}</div>;
	if (!role) return <div>Not found.</div>;

	const dirty =
		draft.size !== role.permissions.length ||
		role.permissions.some((p) => !draft.has(p));

	const toggle = (perm: string) => {
		const next = new Set(draft);
		if (next.has(perm)) next.delete(perm);
		else next.add(perm);
		setDraft(next);
	};

	const save = async () => {
		if (!code) return;
		setSaving(true);
		setErr(null);
		try {
			const updated = await roleApi.setPermissions(code, Array.from(draft));
			setRole(updated);
			setDraft(new Set(updated.permissions));
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Failed to save");
		} finally {
			setSaving(false);
		}
	};

	const cancel = () => {
		setDraft(new Set(role.permissions));
	};

	const doReset = async () => {
		if (!code) return;
		if (!resetArmed) {
			setResetArmed(true);
			// Auto-disarm after 4 s so the button reverts if admin changes mind
			setTimeout(() => setResetArmed(false), 4000);
			return;
		}
		setSaving(true);
		setErr(null);
		try {
			const updated = await roleApi.reset(code);
			setRole(updated);
			setDraft(new Set(updated.permissions));
			setResetArmed(false);
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Failed to reset");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-4 pb-20">
			<PageHeader
				title={role.name}
				breadcrumb="← Back to roles"
				subtitle={`${role.code} · ${role.member_count} member${role.member_count === 1 ? "" : "s"}`}
				actions={
					<Button
						variant="ghost"
						size="sm"
						onClick={() => navigate("/admin/roles")}
					>
						← Back
					</Button>
				}
			/>

			{err && <div className="text-error text-small">{err}</div>}

			<div className="flex justify-end">
				<Button
					variant={resetArmed ? "destructive" : "outline"}
					onClick={doReset}
					disabled={saving}
				>
					{resetArmed ? "Click again to confirm reset" : "Reset to defaults"}
				</Button>
			</div>

			<div className="space-y-6">
				{groups.map((g) => (
					<section key={g.module} className="bg-surface rounded-lg p-4">
						<h2 className="text-h2 font-semibold mb-3">{g.module}</h2>
						<ul className="space-y-2">
							{g.perms.map((p) => (
								<li key={p.code} className="flex items-center gap-3">
									<Checkbox
										id={`perm-${p.code}`}
										checked={draft.has(p.code)}
										onCheckedChange={() => toggle(p.code)}
										aria-label={p.code}
									/>
									<label
										htmlFor={`perm-${p.code}`}
										className="text-small font-mono text-text-secondary cursor-pointer"
									>
										{p.code}
									</label>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>

			{dirty && (
				<div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border-subtle p-4 flex items-center justify-between shadow-lg">
					<span className="text-small text-text-secondary">
						{draft.size} permission{draft.size === 1 ? "" : "s"} selected ·
						unsaved changes
					</span>
					<div className="flex gap-2">
						<Button variant="ghost" onClick={cancel} disabled={saving}>
							Cancel
						</Button>
						<Button onClick={save} disabled={saving}>
							{saving ? "Saving…" : "Save changes"}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
