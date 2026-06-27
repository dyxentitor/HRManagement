import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { employeeApi } from "@/modules/employee/api";

export function EmployeeCodeField({
	value,
	onChange,
	mode,
	onDirty,
}: {
	value: string;
	onChange: (v: string) => void;
	mode: "create" | "edit";
	onDirty?: () => void;
}) {
	const [loading, setLoading] = useState(false);
	const prefilled = useRef(false);

	async function regenerate(force: boolean) {
		setLoading(true);
		try {
			const { code, autofill } = await employeeApi.nextCode();
			if (force || autofill) onChange(code);
		} catch {
			/* leave the field as-is; the user can type one */
		} finally {
			setLoading(false);
		}
	}

	// Create-mode: pre-fill once on mount when empty (respecting the org's autofill
	// setting). Edit-mode never auto-overwrites. The ↻ button always generates.
	useEffect(() => {
		if (mode === "create" && !value && !prefilled.current) {
			prefilled.current = true;
			void regenerate(false);
		}
	}, [mode, value]);

	return (
		<div className="flex gap-2">
			<Input
				aria-label="Employee code"
				value={value}
				onChange={(e) => {
					onChange(e.target.value);
					onDirty?.();
				}}
			/>
			<Button
				type="button"
				variant="outline"
				size="icon"
				disabled={loading}
				aria-label="Regenerate code"
				title="Generate a new employee code"
				onClick={() => regenerate(true)}
			>
				<RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
			</Button>
		</div>
	);
}
