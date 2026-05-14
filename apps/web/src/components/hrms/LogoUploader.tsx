import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { settingsApi } from "@/modules/admin/settings/settings-api";

const MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

interface Props {
	currentLogoUrl: string | null;
	orgName: string;
	onChanged: () => void | Promise<void>;
}

export function LogoUploader({ currentLogoUrl, orgName, onChanged }: Props) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function pick(file: File) {
		setError(null);
		if (!ALLOWED.includes(file.type)) {
			setError("PNG, JPG, or WebP only.");
			return;
		}
		if (file.size > MAX_SIZE) {
			setError("Max file size is 2 MB.");
			return;
		}
		setBusy(true);
		try {
			const presign = await settingsApi.presignLogo(file.type);
			const put = await fetch(presign.presigned_url, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			});
			if (!put.ok) throw new Error(`S3 upload failed: ${put.status}`);
			await settingsApi.registerLogo(presign.s3_key, file.type, file.size);
			await onChanged();
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Upload failed");
		} finally {
			setBusy(false);
		}
	}

	async function remove() {
		setBusy(true);
		try {
			await settingsApi.deleteLogo();
			await onChanged();
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Remove failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex items-center gap-4">
			<div className="w-20 h-20 rounded-xl bg-gradient-to-br from-accent-500 to-lavender flex items-center justify-center overflow-hidden">
				{currentLogoUrl ? (
					<img
						src={currentLogoUrl}
						alt={orgName}
						className="w-full h-full object-contain"
					/>
				) : (
					<span className="text-h3 font-bold text-white">
						{(orgName || "?").charAt(0).toUpperCase()}
					</span>
				)}
			</div>
			<div className="flex flex-col gap-1.5">
				<Button
					type="button"
					onClick={() => fileRef.current?.click()}
					disabled={busy}
				>
					{busy ? "Working…" : "Upload new logo"}
				</Button>
				{currentLogoUrl && (
					<Button
						type="button"
						variant="ghost"
						onClick={remove}
						disabled={busy}
					>
						Remove
					</Button>
				)}
				<input
					ref={fileRef}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					aria-label="Upload company logo"
					className="hidden"
					onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
				/>
				<small className="text-text-tertiary text-small">
					PNG/JPG/WebP, max 2 MB. Auto-resized to 256 px.
				</small>
				{error && <small className="text-coral text-small">{error}</small>}
			</div>
		</div>
	);
}
