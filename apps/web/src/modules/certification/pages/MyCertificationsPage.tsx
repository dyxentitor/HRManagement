import { useCallback, useEffect, useState } from "react";

import { type Certification, certificationApi } from "../api";

function expiryBadge(cert: Certification): string {
	if (cert.status === "expired" || cert.status === "revoked")
		return "text-red-600";
	if (!cert.expires_on) return "text-slate-500";
	const today = new Date();
	const expiry = new Date(cert.expires_on);
	const diffDays = Math.ceil(
		(expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
	);
	if (diffDays <= 30) return "text-red-600 font-semibold";
	if (diffDays <= 60) return "text-amber-600 font-medium";
	return "text-green-600";
}

export default function MyCertificationsPage() {
	const [certs, setCerts] = useState<Certification[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	// Add-cert form state
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
				// employee_id will be set by the API based on the authenticated user
				employee_id: "",
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

	if (loading) return <p>Loading…</p>;

	return (
		<div className="space-y-6 max-w-4xl">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">My Certifications</h1>
				<button
					type="button"
					onClick={() => setShowForm(!showForm)}
					className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
				>
					{showForm ? "Cancel" : "Add Certification"}
				</button>
			</div>

			{error && (
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}
			{success && <p className="text-green-600">{success}</p>}

			{showForm && (
				<form
					onSubmit={handleAdd}
					className="border rounded p-4 space-y-3 bg-white"
				>
					<h2 className="font-semibold">Add Certification</h2>
					<div>
						<label className="block text-sm font-medium">Name *</label>
						<input
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="mt-1 block w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium">Issuer</label>
						<input
							value={issuer}
							onChange={(e) => setIssuer(e.target.value)}
							className="mt-1 block w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium">
							Certificate Number
						</label>
						<input
							value={certNumber}
							onChange={(e) => setCertNumber(e.target.value)}
							className="mt-1 block w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium">Issued On *</label>
						<input
							required
							type="date"
							value={issuedOn}
							onChange={(e) => setIssuedOn(e.target.value)}
							className="mt-1 block w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium">Expires On</label>
						<input
							type="date"
							value={expiresOn}
							onChange={(e) => setExpiresOn(e.target.value)}
							className="mt-1 block w-full border rounded px-3 py-2"
						/>
					</div>
					<button
						type="submit"
						disabled={saving}
						className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
					>
						{saving ? "Saving…" : "Save"}
					</button>
				</form>
			)}

			{certs.length === 0 ? (
				<p className="text-slate-500">No certifications on record.</p>
			) : (
				<table className="w-full border-collapse">
					<thead>
						<tr className="border-b bg-slate-50">
							<th className="text-left p-2">Name</th>
							<th className="text-left p-2">Issuer</th>
							<th className="text-left p-2">Issued</th>
							<th className="text-left p-2">Expires</th>
							<th className="text-left p-2">Status</th>
						</tr>
					</thead>
					<tbody>
						{certs.map((c) => (
							<tr key={c.id} className="border-b hover:bg-slate-50">
								<td className="p-2 font-medium">{c.name}</td>
								<td className="p-2 text-slate-600">{c.issuer || "—"}</td>
								<td className="p-2">{c.issued_on}</td>
								<td className={`p-2 ${expiryBadge(c)}`}>
									{c.expires_on ?? "No expiry"}
								</td>
								<td className="p-2 capitalize">{c.status}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
