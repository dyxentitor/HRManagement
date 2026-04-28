import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface ApprovalActionBarProps {
	onApprove: (comment: string) => void;
	onReject: (comment: string) => void;
	busy?: boolean;
	requireRejectComment?: boolean;
}

export function ApprovalActionBar({
	onApprove,
	onReject,
	busy = false,
	requireRejectComment = false,
}: ApprovalActionBarProps) {
	const [comment, setComment] = useState("");
	const [rejectError, setRejectError] = useState<string | null>(null);

	const handleReject = () => {
		if (requireRejectComment && comment.trim() === "") {
			setRejectError("Comment required to reject.");
			return;
		}
		setRejectError(null);
		onReject(comment);
	};

	return (
		<div className="flex flex-col gap-2">
			<Textarea
				value={comment}
				onChange={(e) => setComment(e.target.value)}
				placeholder="Add a comment (optional for approve, required for reject)…"
				className="bg-canvas border-border-subtle"
				rows={2}
			/>
			{rejectError && (
				<p className="text-small text-coral" role="alert">
					{rejectError}
				</p>
			)}
			<div className="flex gap-2">
				<Button
					type="button"
					onClick={() => onApprove(comment)}
					disabled={busy}
					className="flex-1 bg-accent-500 text-white hover:bg-accent-600"
				>
					Approve
				</Button>
				<Button
					type="button"
					onClick={handleReject}
					disabled={busy}
					variant="outline"
					className="flex-1 bg-canvas text-coral border-coral/30 hover:bg-coral/10"
				>
					Reject
				</Button>
			</div>
		</div>
	);
}
