import { useCallback, useEffect, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";

import { type CertStatus, type Certification, certificationApi } from "../api";

const STATUS_TONE: Record<CertStatus, "mint" | "coral"> = {
	active: "mint",
	expired: "coral",
	revoked: "coral",
};

const STATUS_LABEL: Record<CertStatus, string> = {
	active: "Active",
	expired: "Expired",
	revoked: "Revoked",
};

function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function expiryTone(cert: Certification): string {
	if (cert.status === "expired" || cert.status === "revoked")
		return "text-coral";
	if (!cert.expires_on) return "text-text-secondary";
	const today = new Date();
	const expiry = new Date(cert.expires_on);
	const diffDays = Math.ceil(
		(expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
	);
	if (diffDays <= 30) return "text-coral font-semibold";
	if (diffDays <= 60) return "text-yellow font-medium";
	return "text-text-primary";
}

export default function MyCertificationsPage() {
	const [certs, setCerts] = useState<Certification[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const [showForm, setShowForm] = useState(false);
	const [name, setName] = useState("");
	const [issuer, setIssuer] = useState("");
	const [certNumber, setCertNumber] = useState("");
	const [issuedOn, setIssuedOn] = useState("");
	const [expiresOn, setExpiresOn] = useState("");
	const [saving, setSaving] = useState(false);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setCerts(await certificationApi.myCertifications());
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Failed to load certifications",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function handleAdd(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			await certificationApi.createCertification({
				name,
				issuer,
				certificate_number: certNumber,
				issued_on: issuedOn,
				expires_on: expiresOn || undefined,
			});
			setSuccess("Certification added!");
			setShowForm(false);
			setName("");
			setIssuer("");
			setCertNumber("");
			setIssuedOn("");
			setExpiresOn("");
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to add certification");
		} finally {
			setSaving(false);
		}
	}

	if (loading)
		return <p className="text-text-tertiary p-4">Loading certifications…</p>;

	return (
		<div className="space-y-6 max-w-5xl mx-auto">
			<PageHeader
				breadcrumb="Certifications"
				title="My Certifications"
				actions={
					<button
						type="button"
						onClick={() => setShowForm(!showForm)}
						className="bg-accent-500 text-white px-4 py-2 rounded text-sm hover:bg-accent-600"
					>
						{showForm ? "Cancel" : "Add Certification"}
					</button>
				}
			/>

			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}
			{success && (
				<p className="text-mint text-small" role="status">
					{success}
				</p>
			)}

			{showForm && (
				<form
					onSubmit={handleAdd}
					className="border border-border-subtle rounded-lg p-4 space-y-3 bg-surface-hover"
				>
					<h2 className="text-h2 text-text-primary">Add Certification</h2>
					<div>
						<label
							htmlFor="cert-name"
							className="block text-small text-text-secondary mb-1"
						>
							Name *
						</label>
						<input
							id="cert-name"
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="block w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
						/>
					</div>
					<div>
						<label
							htmlFor="cert-issuer"
							className="block text-small text-text-secondary mb-1"
						>
							Issuer
						</label>
						<input
							id="cert-issuer"
							value={issuer}
							onChange={(e) => setIssuer(e.target.value)}
							className="block w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
						/>
					</div>
					<div>
						<label
							htmlFor="cert-number"
							className="block text-small text-text-secondary mb-1"
						>
							Certificate Number
						</label>
						<input
							id="cert-number"
							value={certNumber}
							onChange={(e) => setCertNumber(e.target.value)}
							className="block w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
						/>
					</div>
					<div>
						<label
							htmlFor="cert-issued"
							className="block text-small text-text-secondary mb-1"
						>
							Issued On *
						</label>
						<input
							id="cert-issued"
							required
							type="date"
							value={issuedOn}
							onChange={(e) => setIssuedOn(e.target.value)}
							className="block w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
						/>
					</div>
					<div>
						<label
							htmlFor="cert-expires"
							className="block text-small text-text-secondary mb-1"
						>
							Expires On
						</label>
						<input
							id="cert-expires"
							type="date"
							value={expiresOn}
							onChange={(e) => setExpiresOn(e.target.value)}
							className="block w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
						/>
					</div>
					<button
						type="submit"
						disabled={saving}
						className="bg-accent-500 text-white px-4 py-2 rounded text-sm hover:bg-accent-600 disabled:opacity-50"
					>
						{saving ? "Saving…" : "Save"}
					</button>
				</form>
			)}

			{certs.length === 0 ? (
				<div className="bg-surface-hover border border-border-subtle rounded-lg p-8 text-center">
					<p className="text-text-secondary">No certifications on record.</p>
				</div>
			) : (
				<section className="bg-surface-hover border border-border-subtle rounded-lg overflow-hidden">
					<table className="w-full text-sm border-collapse">
						<thead>
							<tr className="border-b border-border-subtle bg-surface-hover">
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Name
								</th>
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Issuer
								</th>
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Issued
								</th>
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Expires
								</th>
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Status
								</th>
							</tr>
						</thead>
						<tbody>
							{certs.map((c) => (
								<tr
									key={c.id}
									className="border-b border-border-subtle last:border-0 hover:bg-surface-hover transition-colors"
								>
									<td className="py-3 px-4 text-body text-text-primary font-medium">
										{c.name}
									</td>
									<td className="py-3 px-4 text-body text-text-secondary">
										{c.issuer || "—"}
									</td>
									<td className="py-3 px-4 text-body text-text-primary">
										{formatDate(c.issued_on)}
									</td>
									<td className={`py-3 px-4 text-body ${expiryTone(c)}`}>
										{c.expires_on ? formatDate(c.expires_on) : "No expiry"}
									</td>
									<td className="py-3 px-4">
										<StatusPill
											tone={STATUS_TONE[c.status]}
											label={STATUS_LABEL[c.status]}
										/>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}
		</div>
	);
}
