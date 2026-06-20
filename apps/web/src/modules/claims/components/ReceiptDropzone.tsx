import { FileText, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface ReceiptDropzoneProps {
	files: File[];
	onChange: (files: File[]) => void;
	required?: boolean;
}

/** Drag-or-browse receipt upload with file chips (replaces the raw file input). */
export function ReceiptDropzone({ files, onChange, required = false }: ReceiptDropzoneProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const missing = required && files.length === 0;

	function add(list: FileList | null) {
		if (!list || list.length === 0) return;
		const incoming = Array.from(list);
		const names = new Set(files.map((f) => f.name));
		onChange([...files, ...incoming.filter((f) => !names.has(f.name))]);
	}

	function remove(name: string) {
		onChange(files.filter((f) => f.name !== name));
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
				onChange={(e) => add(e.target.files)}
			/>

			{files.length > 0 && (
				<ul className="mt-2 space-y-1.5">
					{files.map((f) => (
						<li
							key={f.name}
							className="flex items-center gap-2.5 bg-surface-hover border border-border-subtle rounded-lg px-3 py-2"
						>
							<FileText className="size-4 text-text-tertiary shrink-0" aria-hidden />
							<span className="text-small text-text-secondary truncate flex-1">{f.name}</span>
							<span className="text-[10px] text-text-tertiary tabular-nums shrink-0">
								{(f.size / 1024).toFixed(0)} KB
							</span>
							<button
								type="button"
								onClick={() => remove(f.name)}
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
