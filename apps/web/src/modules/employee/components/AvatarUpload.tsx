import { Camera } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { employeeApi } from "../api";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

interface Props {
	photoUrl: string | null;
	fullName: string;
	size?: "sm" | "md" | "lg";
	onUploaded: () => void;
	onDeleted: () => void;
	uploadFor?: { kind: "self" } | { kind: "employee"; id: string };
	/** Hide the inline "Remove photo" caption (editing stays via the camera badge). */
	showRemove?: boolean;
}

export function AvatarUpload({
	photoUrl,
	fullName,
	size = "lg",
	onUploaded,
	onDeleted,
	uploadFor = { kind: "self" },
	showRemove = true,
}: Props) {
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [busy, setBusy] = useState(false);

	const sizeClass = size === "lg" ? "size-20" : size === "md" ? "size-12" : "size-8";

	async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		if (!ALLOWED_TYPES.has(file.type)) {
			toast.error("Use JPEG, PNG, or WebP.");
			return;
		}
		if (file.size > MAX_BYTES) {
			toast.error("Photo must be 5 MB or smaller.");
			return;
		}

		setBusy(true);
		try {
			if (uploadFor.kind === "self") {
				await employeeApi.uploadMyPhoto(file);
			} else {
				await employeeApi.uploadEmployeePhoto(uploadFor.id, file);
			}
			toast.success("Photo uploading… your avatar will update in a moment.");
			onUploaded();
		} catch {
			toast.error("Upload failed. Try again.");
		} finally {
			setBusy(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	}

	async function handleRemove() {
		setBusy(true);
		try {
			if (uploadFor.kind === "self") {
				await employeeApi.deleteMyPhoto();
			} else {
				await employeeApi.deleteEmployeePhoto(uploadFor.id);
			}
			toast.success("Photo removed");
			onDeleted();
		} catch {
			toast.error("Delete failed. Try again.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col items-center gap-1.5">
			<div className="relative">
				{photoUrl ? (
					<img
						src={photoUrl}
						alt={`${fullName} avatar`}
						className={`${sizeClass} rounded-full object-cover border-2 border-accent-500/30`}
					/>
				) : (
					<div
						className={`${sizeClass} rounded-full bg-gradient-to-br from-lavender to-mint border-2 border-accent-500/30`}
						aria-hidden
					/>
				)}
				<label
					htmlFor={inputId}
					aria-label="Change photo"
					className="absolute -bottom-1 -right-1 grid place-items-center size-7 rounded-full bg-accent-500 text-white shadow cursor-pointer hover:bg-accent-600"
				>
					<Camera className="size-3.5" />
					<input
						id={inputId}
						ref={inputRef}
						type="file"
						accept="image/jpeg,image/png,image/webp"
						className="sr-only"
						disabled={busy}
						onChange={handleFile}
					/>
				</label>
			</div>
			{photoUrl && showRemove && (
				<button
					type="button"
					onClick={handleRemove}
					disabled={busy}
					className="text-small text-coral hover:text-coral/80 disabled:opacity-50"
				>
					Remove photo
				</button>
			)}
		</div>
	);
}
