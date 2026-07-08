import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { NotLinkedEmptyState } from "@/components/hrms/NotLinkedEmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { employeeApi } from "@/modules/employee/api";

import { type ClaimCategory, claimsApi } from "../api";
import { ClaimStepper } from "../components/ClaimStepper";
import { ReceiptDropzone } from "../components/ReceiptDropzone";
import { TONE_CHIP, categoryCopy, categoryMeta, fmtDate, fmtMoney, num } from "../lib/claim-ui";

export default function ClaimSubmitPage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const presetCategory = searchParams.get("category");
	const [noEmployee, setNoEmployee] = useState(false);
	const [categories, setCategories] = useState<ClaimCategory[]>([]);
	const [category, setCategory] = useState("");
	const [amount, setAmount] = useState("");
	const [expenseDate, setExpenseDate] = useState("");
	const [merchant, setMerchant] = useState("");
	const [description, setDescription] = useState("");
	const [businessJustification, setBusinessJustification] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		employeeApi.getMe().then((emp) => {
			if (!emp) {
				setNoEmployee(true);
				return;
			}
			claimsApi
				.listCategories()
				.then((cats) => {
					setCategories(cats);
					if (presetCategory && cats.some((c) => c.id === presetCategory)) {
						setCategory(presetCategory);
					}
				})
				.catch(() => setError("Failed to load categories"));
		});
	}, [presetCategory]);

	const selectedCat = categories.find((c) => c.id === category);
	const requiresAttachment = selectedCat?.requires_attachment ?? false;
	const currency = selectedCat?.currency_code || "MYR";
	const meta = selectedCat ? categoryMeta(`${selectedCat.code} ${selectedCat.name}`) : null;

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
			const created = await claimsApi.create({
				category,
				amount,
				currency_code: currency,
				expense_date: expenseDate,
				description,
				merchant: merchant || undefined,
				business_justification: businessJustification || undefined,
			});
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
		category !== "" &&
		amount !== "" &&
		expenseDate !== "" &&
		(!requiresAttachment || files.length > 0) &&
		!submitting;

	if (noEmployee) {
		return (
			<div className="max-w-xl space-y-4">
				<PageHeader title="Submit a claim" />
				<NotLinkedEmptyState scope="claims" />
			</div>
		);
	}

	return (
		<form onSubmit={onSubmit} className="space-y-5">
			<PageHeader
				title="Submit a claim"
				subtitle="Fill it in once — we'll show where it goes and what's needed."
			/>

			<div className="grid lg:grid-cols-[1.55fr_1fr] gap-5 items-start">
				{/* Form */}
				<div className="glass-surface rounded-2xl p-5 space-y-4">
					<div>
						<span className="text-label uppercase text-text-tertiary block mb-1.5">Category</span>
						<Select value={category} onValueChange={setCategory}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select a category…" />
							</SelectTrigger>
							<SelectContent>
								{categories.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{c.name}
										{c.requires_attachment ? " · receipt required" : ""}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{selectedCat && (
							<p className="text-small text-text-tertiary mt-1.5">
								{categoryCopy(`${selectedCat.code} ${selectedCat.name}`, requiresAttachment)}
							</p>
						)}
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<span className="text-label uppercase text-text-tertiary block mb-1.5">Amount</span>
							<div className="flex items-center bg-canvas border border-border-subtle rounded-lg overflow-hidden focus-within:border-accent-500">
								<span className="px-3 py-2 text-text-tertiary bg-surface-hover border-r border-border-subtle">
									{currency}
								</span>
								<input
									type="number"
									step="0.01"
									min="0"
									value={amount}
									onChange={(e) => setAmount(e.target.value)}
									required
									placeholder="0.00"
									aria-label="Amount"
									className="flex-1 bg-transparent px-3 py-2 text-text-primary tabular-nums placeholder:text-text-tertiary focus:outline-none"
								/>
							</div>
						</div>
						<div>
							<span className="text-label uppercase text-text-tertiary block mb-1.5">
								Expense date
							</span>
							<Input
								type="date"
								value={expenseDate}
								onChange={(e) => setExpenseDate(e.target.value)}
								required
								aria-label="Expense date"
							/>
						</div>
					</div>

					<div>
						<span className="text-label uppercase text-text-tertiary block mb-1.5">
							Merchant{" "}
							<span className="normal-case tracking-normal text-text-tertiary">· optional</span>
						</span>
						<Input
							value={merchant}
							onChange={(e) => setMerchant(e.target.value)}
							placeholder="e.g. Klinik Mediviron"
						/>
					</div>

					<div>
						<span className="text-label uppercase text-text-tertiary block mb-1.5">
							Description{" "}
							<span className="normal-case tracking-normal text-text-tertiary">· optional</span>
						</span>
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
							placeholder="What was it for…"
						/>
					</div>

					<div>
						<span className="text-label uppercase text-text-tertiary block mb-1.5">
							Business justification{" "}
							<span className="normal-case tracking-normal text-text-tertiary">· optional</span>
						</span>
						<Textarea
							value={businessJustification}
							onChange={(e) => setBusinessJustification(e.target.value)}
							rows={2}
							placeholder="Why is this expense justified for the business…"
						/>
					</div>

					<div>
						<span
							className={cn(
								"text-label uppercase block mb-1.5",
								requiresAttachment ? "text-coral" : "text-text-tertiary",
							)}
						>
							Receipts {requiresAttachment ? "· required" : "· optional"}
						</span>
						<ReceiptDropzone files={files} onChange={setFiles} required={requiresAttachment} />
					</div>
				</div>

				{/* Live summary */}
				<div className="glass-surface rounded-2xl p-5">
					<span className="layer-eyebrow">Claim summary</span>
					<p className="text-h1 font-extralight tracking-tight mt-2 tabular-nums">
						{amount ? fmtMoney(num(amount), currency) : `${currency} 0`}
					</p>

					<div className="flex items-center gap-2.5 mt-3">
						<span
							className={cn(
								"size-8 rounded-lg grid place-items-center",
								meta ? TONE_CHIP[meta.tone] : "bg-surface-hover text-text-tertiary",
							)}
							aria-hidden
						>
							{meta ? <meta.icon className="size-4" /> : "—"}
						</span>
						<div className="min-w-0">
							<p className="text-small text-text-primary truncate">
								{selectedCat?.name ?? "Pick a category"}
							</p>
							<p className="text-[11px] text-text-tertiary truncate">
								{[merchant, expenseDate ? fmtDate(expenseDate) : null]
									.filter(Boolean)
									.join(" · ") || "—"}
							</p>
						</div>
					</div>

					<div className="flex justify-between text-small border-t border-border-subtle mt-3 pt-3">
						<span className="text-text-tertiary">Receipts</span>
						{files.length > 0 ? (
							<span className="text-mint">{files.length} attached ✓</span>
						) : requiresAttachment ? (
							<span className="text-coral">Required</span>
						) : (
							<span className="text-text-tertiary">None</span>
						)}
					</div>

					<p className="layer-eyebrow mt-5 mb-2">Where it goes</p>
					<ClaimStepper status="draft" />
					<p className="text-small text-text-tertiary mt-3">
						Typical turnaround is 3–7 working days.
					</p>

					{error && (
						<p role="alert" className="text-coral text-small mt-3">
							{error}
						</p>
					)}

					<Button type="submit" disabled={!canSubmit} className="w-full mt-4 soft-glow rounded-xl">
						{submitting ? "Submitting…" : "Submit claim"}
					</Button>
				</div>
			</div>
		</form>
	);
}
