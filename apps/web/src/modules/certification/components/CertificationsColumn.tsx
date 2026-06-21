import { FileText, Paperclip, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { type Certification, certificationApi } from "../api";
import { certStatusView, certSummary, fmtDate } from "../lib/cert-ui";
import { AddCertificationDrawer } from "./AddCertificationDrawer";
import { GrowthHero } from "./GrowthHero";

function CertRow({ cert }: { cert: Certification }) {
	const sv = certStatusView(cert);
	async function viewDoc() {
		try {
			const { url } = await certificationApi.downloadDocument(cert.id);
			window.open(url, "_blank", "noopener,noreferrer");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not open the document");
		}
	}
	return (
		<li className="flex items-center gap-3 px-3 py-2.5 border-t border-border-subtle first:border-t-0">
			<span className="size-9 rounded-xl grid place-items-center bg-surface-elevated/50 shrink-0">
				<FileText className="size-4 text-text-secondary" />
			</span>
			<div className="min-w-0 flex-1">
				<p className="text-small text-text-primary truncate">{cert.name}</p>
				<p className="text-[11px] text-text-tertiary truncate">
					{cert.issuer || "—"} · issued {fmtDate(cert.issued_on)}
					{cert.document_s3_key && (
						<button
							type="button"
							onClick={viewDoc}
							className="ml-2 inline-flex items-center gap-0.5 text-accent-200 hover:underline"
						>
							<Paperclip className="size-3" /> View
						</button>
					)}
				</p>
			</div>
			<div className="text-right shrink-0">
				<StatusPill tone={sv.tone} label={sv.label} />
				<p className="text-[10px] text-text-tertiary mt-1">{fmtDate(cert.expires_on)}</p>
			</div>
		</li>
	);
}

export function CertificationsColumn() {
	const [certs, setCerts] = useState<Certification[]>([]);
	const [loading, setLoading] = useState(true);
	const [adding, setAdding] = useState(false);

	const refresh = useCallback(async () => {
		try {
			setCerts(await certificationApi.myCertifications());
		} catch {
			setCerts([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const s = certSummary(certs);
	const headline =
		s.expiring > 0
			? `${s.expiring} expiring soon`
			: s.expired > 0
				? `${s.expired} to renew`
				: "All current";

	if (loading) return <Skeleton className="h-[244px] rounded-2xl" />;

	return (
		<div className="flex flex-col gap-3">
			<p className="layer-eyebrow">／ My Certifications</p>
			<GrowthHero
				accent="yellow"
				eyebrow="Compliance"
				headline={headline}
				context={`${s.total} certificate${s.total === 1 ? "" : "s"} · ${s.compliancePct}% in good standing`}
				ringSegments={[
					{ value: s.active, color: "mint" },
					{ value: s.expiring, color: "yellow" },
					{ value: s.expired, color: "coral" },
				]}
				ringCenter={`${s.compliancePct}%`}
				ringSub="ok"
				tiles={[
					{ n: s.active, label: "Active", tone: "mint" },
					{ n: s.expiring, label: "Expiring", tone: "yellow" },
					{ n: s.expired, label: "Expired", tone: "coral" },
				]}
				nextUp={
					s.nextToExpire ? (
						<span className="text-text-secondary truncate">
							⚠️ Next — <b className="text-text-primary">{s.nextToExpire.name}</b> ·{" "}
							{fmtDate(s.nextToExpire.expires_on)}
						</span>
					) : (
						<span className="text-text-tertiary">Nothing expiring — you're all set.</span>
					)
				}
				action={
					<Button
						type="button"
						onClick={() => setAdding(true)}
						className="soft-glow rounded-xl shrink-0"
					>
						<Plus className="size-4 mr-1" /> Add
					</Button>
				}
			/>

			<div className="glass-surface rounded-2xl px-1.5 py-1">
				{certs.length === 0 ? (
					<p className="text-small text-text-tertiary text-center py-8">
						No certificates yet — add your first one.
					</p>
				) : (
					<ul className="max-h-[340px] overflow-y-auto">
						{certs.map((c) => (
							<CertRow key={c.id} cert={c} />
						))}
					</ul>
				)}
			</div>

			<AddCertificationDrawer open={adding} onClose={() => setAdding(false)} onCreated={refresh} />
		</div>
	);
}
