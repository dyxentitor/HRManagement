import { Paperclip, X } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { DetailPanel } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { type Certification, certificationApi } from "../api";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/*,application/pdf";

function Labeled({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-label uppercase text-text-tertiary">{label}</span>
			{children}
		</label>
	);
}

export function AddCertificationDrawer({
	open,
	onClose,
	onCreated,
}: {
	open: boolean;
	onClose: () => void;
	onCreated: () => void;
}) {
	const [name, setName] = useState("");
	const [issuer, setIssuer] = useState("");
	const [certNo, setCertNo] = useState("");
	const [issuedOn, setIssuedOn] = useState("");
	const [expiresOn, setExpiresOn] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [saving, setSaving] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	function reset() {
		setName("");
		setIssuer("");
		setCertNo("");
		setIssuedOn("");
		setExpiresOn("");
		setFile(null);
	}

	function pickFile(f: File | null) {
		if (f && f.size > MAX_BYTES) {
			toast.error("That file is over 10 MB — please choose a smaller one.");
			return;
		}
		setFile(f);
	}

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (!name.trim() || !issuedOn) {
			toast.error("Name and issue date are required.");
			return;
		}
		setSaving(true);
		try {
			const cert: Certification = await certificationApi.createCertification({
				name: name.trim(),
				issuer: issuer.trim() || undefined,
				certificate_number: certNo.trim() || undefined,
				issued_on: issuedOn,
				expires_on: expiresOn || undefined,
			});
			if (file) {
				await certificationApi.uploadCertificationDocument(cert.id, file);
			}
			toast.success(file ? "Certificate added with document" : "Certificate added");
			reset();
			onCreated();
			onClose();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not add the certificate");
		} finally {
			setSaving(false);
		}
	}

	return (
		<DetailPanel open={open} onClose={onClose} title="Add a certificate">
			<form onSubmit={onSubmit} className="flex flex-col gap-3.5">
				<Labeled label="Name">
					<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CISSP" />
				</Labeled>
				<Labeled label="Issuer">
					<Input
						value={issuer}
						onChange={(e) => setIssuer(e.target.value)}
						placeholder="e.g. ISC²"
					/>
				</Labeled>
				<Labeled label="Certificate no.">
					<Input value={certNo} onChange={(e) => setCertNo(e.target.value)} />
				</Labeled>
				<div className="grid grid-cols-2 gap-3">
					<Labeled label="Issued on">
						<Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
					</Labeled>
					<Labeled label="Expires on">
						<Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
					</Labeled>
				</div>

				<div>
					<span className="text-label uppercase text-text-tertiary">Document (image or PDF)</span>
					<input
						ref={fileRef}
						type="file"
						accept={ACCEPT}
						className="hidden"
						onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
					/>
					{file ? (
						<div className="mt-1 flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-elevated/30 px-3 py-2">
							<Paperclip className="size-4 text-accent-200" />
							<span className="text-small text-text-primary truncate flex-1">{file.name}</span>
							<button
								type="button"
								onClick={() => setFile(null)}
								className="text-text-tertiary hover:text-coral"
								aria-label="Remove file"
							>
								<X className="size-4" />
							</button>
						</div>
					) : (
						<Button
							type="button"
							variant="outline"
							className="mt-1 w-full border-dashed"
							onClick={() => fileRef.current?.click()}
						>
							<Paperclip className="size-4 mr-1.5" /> Attach a scan or photo
						</Button>
					)}
				</div>

				<Button type="submit" disabled={saving} className="mt-1 soft-glow">
					{saving ? "Saving…" : "Add certificate"}
				</Button>
			</form>
		</DetailPanel>
	);
}
