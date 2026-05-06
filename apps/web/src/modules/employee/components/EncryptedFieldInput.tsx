import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Props {
	label: string;
	last4: string | null;
	onReplace: (value: string) => void;
	canWrite: boolean;
}

export function EncryptedFieldInput({
	label,
	last4,
	onReplace,
	canWrite,
}: Props) {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");

	const summary =
		last4 && last4.length > 0
			? `🔒 ${label} ending in •••${last4}`
			: "🔒 Encrypted";

	function handleSave() {
		if (!value) return;
		onReplace(value);
		setValue("");
		setOpen(false);
	}

	return (
		<div className="flex items-center gap-2">
			<span className="font-mono text-small text-text-primary">{summary}</span>
			{canWrite && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setOpen(true)}
				>
					Replace
				</Button>
			)}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Replace {label}</DialogTitle>
					</DialogHeader>
					<div className="space-y-2">
						<label
							htmlFor={`replace-${label}`}
							className="text-label uppercase text-text-tertiary"
						>
							New {label} value
						</label>
						<Input
							id={`replace-${label}`}
							autoFocus
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
						<p className="text-small text-text-tertiary">
							The current value isn't shown — replacing overwrites it entirely.
						</p>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<Button type="button" onClick={handleSave} disabled={!value}>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
