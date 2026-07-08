import { FileText } from "lucide-react";
import { useState } from "react";

import { claimsApi } from "../api";

export interface ReceiptRef {
	id: number;
	filename: string;
	size_bytes: number;
}

/** Lists a claim's receipts; clicking one opens its presigned URL in a new tab. */
export function ClaimReceipts({
	claimId,
	attachments,
}: {
	claimId: string;
	attachments: ReceiptRef[];
}) {
	const [error, setError] = useState<string | null>(null);

	async function open(attachmentId: number) {
		setError(null);
		try {
			const { url } = await claimsApi.downloadAttachment(claimId, attachmentId);
			window.open(url, "_blank", "noopener,noreferrer");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not open the receipt");
		}
	}

	if (attachments.length === 0) {
		return <span className="text-small text-text-tertiary">None attached</span>;
	}

	return (
		<div>
			<ul className="space-y-1.5">
				{attachments.map((a) => (
					<li key={a.id}>
						<button
							type="button"
							onClick={() => open(a.id)}
							title={a.filename}
							className="flex w-full min-w-0 items-center gap-2 text-left text-accent-200 hover:underline"
						>
							<FileText className="size-3.5 shrink-0" aria-hidden />
							<span className="min-w-0 flex-1 truncate">{a.filename}</span>
							<span className="text-[10px] text-text-tertiary tabular-nums shrink-0">
								{(a.size_bytes / 1024).toFixed(0)} KB
							</span>
						</button>
					</li>
				))}
			</ul>
			{error && (
				<p role="alert" className="text-coral text-[10px] mt-1">
					{error}
				</p>
			)}
		</div>
	);
}
