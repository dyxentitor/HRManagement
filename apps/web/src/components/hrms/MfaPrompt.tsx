import { useState } from "react";

interface Props {
	onCancel: () => void;
	onSubmit: (code: string) => void;
	error?: string;
}

export function MfaPrompt({ onCancel, onSubmit, error }: Props) {
	const [code, setCode] = useState("");
	return (
		<div
			role="dialog"
			aria-label="MFA required"
			className="fixed inset-0 z-50 grid place-items-center bg-black/60"
		>
			<div className="bg-surface border border-border-subtle rounded-lg p-5 w-full max-w-sm space-y-3">
				<h3 className="text-h3">Enter your MFA code</h3>
				<input
					aria-label="MFA code"
					value={code}
					onChange={(e) => setCode(e.target.value)}
					className="w-full bg-canvas border border-border-subtle rounded px-2 py-1.5 font-mono"
				/>
				{error && (
					<p className="text-small text-coral" role="alert">
						{error}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="text-small text-text-secondary"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => onSubmit(code)}
						className="text-small px-3 py-1 bg-accent-500 text-white rounded"
					>
						Submit
					</button>
				</div>
			</div>
		</div>
	);
}
