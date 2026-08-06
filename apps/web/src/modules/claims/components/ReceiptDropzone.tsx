import { FileText, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface ReceiptDropzoneProps {
	files: File[];
	onChange: (files: File[]) => void;
	required?: boolean;
}

/** Identity of a picked file.
 *
 * Deliberately NOT the filename alone: two genuinely different receipts are
 * very often both called "Receipt.pdf" (bank exports, scanner defaults), and
 * de-duplicating on name silently dropped the second one. Name + size +
 * lastModified distinguishes them while still catching a true re-pick of the
 * same file. Duplicate filenames are safe downstream — claim_attachment has no
 * unique constraint on filename and s3_keys are UUID-prefixed.
 */
function fileKey(f: File): string {
	return `${f.name}|${f.size}|${f.lastModified}`;
}

/** Drag-or-browse receipt upload with file chips (replaces the raw file input). */
export function ReceiptDropzone({ files, onChange, required = false }: ReceiptDropzoneProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const [skipped, setSkipped] = useState(0);
	const missing = required && files.length === 0;

	function add(list: FileList | null) {
		if (!list || list.length === 0) return;
		const incoming = Array.from(list);
		const seen = new Set(files.map(fileKey));
		const fresh = incoming.filter((f) => !seen.has(fileKey(f)));
		// Tell the user when something was dropped rather than failing silently.
		setSkipped(incoming.length - fresh.length);
		if (fresh.length > 0) onChange([...files, ...fresh]);
	}

	function remove(key: string) {
		setSkipped(0);
		onChange(files.filter((f) => fileKey(f) !== key));
	}

	return (
		<div>
			<button
				type="button"
				onClick={() => inputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragging(false);
					add(e.dataTransfer.files);
				}}
				className={cn(
					"w-full rounded-xl border border-dashed p-5 text-center transition-colors duration-fast",
					dragging
						? "border-accent-500 bg-accent-500/5"
						: missing
							? "border-coral/40 hover:border-coral/60"
							: "border-border-strong hover:border-accent-500/50",
				)}
			>
				<Upload className="size-5 mx-auto text-text-tertiary" aria-hidden />
				<p className="text-small text-text-secondary mt-2">
					Drag receipts here or <span className="text-accent-200">browse</span>
				</p>
				<p className="text-[10px] text-text-tertiary mt-0.5">PDF, JPG or PNG · up to 10MB each</p>
			</button>
			<input
				ref={inputRef}
				type="file"
				multiple
				className="hidden"
				aria-label="Receipts"
				onChange={(e) => {
					add(e.target.files);
					// Reset so re-picking the SAME file after removing it still
					// fires a change event (the browser suppresses it otherwise).
					e.target.value = "";
				}}
			/>

			{skipped > 0 && (
				<p role="status" className="mt-1.5 text-[11px] text-text-tertiary">
					{skipped} file{skipped > 1 ? "s were" : " was"} already attached and{" "}
					{skipped > 1 ? "were" : "was"} skipped.
				</p>
			)}

			{files.length > 0 && (
				<ul className="mt-2 space-y-1.5">
					{files.map((f) => (
						<li
							// Composite key: two receipts may legitimately share a filename.
							key={fileKey(f)}
							className="flex items-center gap-2.5 bg-surface-hover border border-border-subtle rounded-lg px-3 py-2"
						>
							<FileText className="size-4 text-text-tertiary shrink-0" aria-hidden />
							<span className="text-small text-text-secondary truncate flex-1">{f.name}</span>
							<span className="text-[10px] text-text-tertiary tabular-nums shrink-0">
								{(f.size / 1024).toFixed(0)} KB
							</span>
							<button
								type="button"
								onClick={() => remove(fileKey(f))}
								className="text-text-tertiary hover:text-coral shrink-0"
								aria-label={`Remove ${f.name}`}
							>
								<X className="size-3.5" />
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
