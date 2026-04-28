import { Upload, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PresignedUpload {
	url: string;
	fields: Record<string, string>;
	key: string;
}

export interface FileUploaderProps {
	accept: string;
	maxSize: number;
	getPresignedUpload: (file: File) => Promise<PresignedUpload>;
	onUploaded: (key: string, file: File) => void;
}

export function FileUploader({
	accept,
	maxSize,
	getPresignedUpload,
	onUploaded,
}: FileUploaderProps) {
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState<string | null>(null);

	const handle = async (file: File) => {
		setError(null);
		if (file.size > maxSize) {
			setError(
				`File is too large. Max ${(maxSize / 1024 / 1024).toFixed(1)} MB.`,
			);
			return;
		}
		setBusy(true);
		try {
			const presigned = await getPresignedUpload(file);
			const form = new FormData();
			for (const [k, v] of Object.entries(presigned.fields)) form.append(k, v);
			form.append("file", file);
			const resp = await fetch(presigned.url, { method: "POST", body: form });
			if (!resp.ok) throw new Error(`Upload failed (${resp.status})`);
			setDone(file.name);
			onUploaded(presigned.key, file);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Upload failed");
		} finally {
			setBusy(false);
		}
	};

	if (done) {
		return (
			<div className="flex items-center gap-2 bg-surface-hover border border-border-subtle rounded-md p-2.5">
				<span className="text-small text-text-secondary truncate flex-1">
					{done}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => {
						setDone(null);
						if (inputRef.current) inputRef.current.value = "";
					}}
					aria-label="Remove file"
				>
					<X className="size-4" />
				</Button>
			</div>
		);
	}

	return (
		<div>
			<label
				htmlFor={inputId}
				className={cn(
					"flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border-subtle rounded-lg p-6 cursor-pointer hover:border-accent-500/50 transition-colors duration-fast",
					busy && "opacity-50 pointer-events-none",
				)}
			>
				<Upload className="size-5 text-text-tertiary" aria-hidden />
				<span className="text-body text-text-secondary">
					Drop a file here or <span className="text-accent-200">browse</span>
				</span>
				<span className="text-small text-text-tertiary">
					Max {(maxSize / 1024 / 1024).toFixed(1)} MB · {accept}
				</span>
				<input
					ref={inputRef}
					id={inputId}
					type="file"
					accept={accept}
					className="sr-only"
					aria-label="Upload"
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) void handle(f);
					}}
				/>
			</label>
			{error && (
				<p className="text-small text-coral mt-2" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
