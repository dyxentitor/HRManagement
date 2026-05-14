import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { NotLinkedEmptyState } from "@/components/hrms/NotLinkedEmptyState";

import { employeeApi } from "@/modules/employee/api";
import { type ClaimCategory, claimsApi } from "../api";

export default function ClaimSubmitPage() {
	const navigate = useNavigate();
	const [noEmployee, setNoEmployee] = useState<boolean>(false);
	const [categories, setCategories] = useState<ClaimCategory[]>([]);
	const [category, setCategory] = useState<string>("");
	const [amount, setAmount] = useState<string>("");
	const [expenseDate, setExpenseDate] = useState<string>("");
	const [merchant, setMerchant] = useState<string>("");
	const [description, setDescription] = useState<string>("");
	const [files, setFiles] = useState<File[]>([]);
	const [submitting, setSubmitting] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		employeeApi.getMe().then((emp) => {
			if (!emp) {
				setNoEmployee(true);
				return;
			}
			claimsApi
				.listCategories()
				.then(setCategories)
				.catch(() => setError("Failed to load categories"));
		});
	}, []);

	const selectedCat = categories.find((c) => c.id === category);
	const requiresAttachment = selectedCat?.requires_attachment ?? false;

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		if (e.target.files) setFiles(Array.from(e.target.files));
	}

	async function uploadFile(claimId: string, f: File): Promise<void> {
		const presigned = await claimsApi.presignedUpload(
			claimId,
			f.name,
			f.type || "application/octet-stream",
		);
		const putResp = await fetch(presigned.presigned_url, {
			method: "PUT",
			headers: { "Content-Type": f.type || "application/octet-stream" },
			body: f,
		});
		if (!putResp.ok) throw new Error(`S3 PUT failed: ${putResp.status}`);
		await claimsApi.registerAttachment(claimId, {
			filename: f.name,
			content_type: f.type || "application/octet-stream",
			size_bytes: f.size,
			s3_key: presigned.s3_key,
		});
	}

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			const cat = categories.find((c) => c.id === category);
			const created = await claimsApi.create({
				category,
				amount,
				currency_code: cat?.currency_code || "MYR",
				expense_date: expenseDate,
				description,
				merchant: merchant || undefined,
			});
			// Upload attachments (if any) before submit so they're attached when approver looks
			for (const f of files) {
				await uploadFile(created.id, f);
			}
			await claimsApi.submit(created.id);
			navigate("/claims/me");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Submission failed");
		} finally {
			setSubmitting(false);
		}
	}

	const canSubmit =
		!!category &&
		!!amount &&
		!!expenseDate &&
		(!requiresAttachment || files.length > 0) &&
		!submitting;

	if (noEmployee) {
		return (
			<div className="space-y-4 max-w-xl">
				<h1 className="text-2xl font-bold">Submit a Claim</h1>
				<NotLinkedEmptyState scope="claims" />
			</div>
		);
	}

	return (
		<div className="space-y-4 max-w-xl">
			<h1 className="text-2xl font-bold">Submit a Claim</h1>
			<form onSubmit={onSubmit} className="space-y-3">
				<Field label="Category" required>
					<select
						value={category}
						onChange={(e) => setCategory(e.target.value)}
						required
						className="w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
						aria-label="Category"
					>
						<option value="">Select…</option>
						{categories.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name} {c.requires_attachment ? "(attachment required)" : ""}
							</option>
						))}
					</select>
				</Field>

				<div className="grid grid-cols-2 gap-3">
					<Field label="Amount (MYR)" required>
						<input
							type="number"
							step="0.01"
							min="0"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							required
							className="w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
						/>
					</Field>
					<Field label="Expense date" required>
						<input
							type="date"
							value={expenseDate}
							onChange={(e) => setExpenseDate(e.target.value)}
							required
							className="w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
						/>
					</Field>
				</div>

				<Field label="Merchant">
					<input
						type="text"
						value={merchant}
						onChange={(e) => setMerchant(e.target.value)}
						className="w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
					/>
				</Field>

				<Field label="Description">
					<textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						rows={3}
						className="w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
					/>
				</Field>

				<Field
					label={`Receipts ${requiresAttachment ? "(required)" : "(optional)"}`}
				>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						onChange={handleFileChange}
						className="block text-sm"
					/>
					{files.length > 0 && (
						<ul className="mt-2 text-xs text-text-secondary">
							{files.map((f) => (
								<li key={f.name}>
									{f.name} ({(f.size / 1024).toFixed(1)} KB)
								</li>
							))}
						</ul>
					)}
				</Field>

				{error && (
					<p role="alert" className="text-coral text-sm">
						{error}
					</p>
				)}

				<button
					type="submit"
					disabled={!canSubmit}
					className="bg-accent-500 text-white py-2 px-4 rounded disabled:opacity-50 hover:bg-accent-600"
				>
					{submitting ? "Submitting…" : "Submit claim"}
				</button>
			</form>
		</div>
	);
}

function Field({
	label,
	required,
	children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
	return (
		<label className="block">
			<span className="block text-sm text-text-secondary mb-1">
				{label} {required && <span className="text-coral">*</span>}
			</span>
			{children}
		</label>
	);
}
