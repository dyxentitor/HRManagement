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

	async function regenerate() {
		setLoading(true);
		try {
			onChange(await employeeApi.nextCode());
		} catch {
			/* leave the field as-is; the user can type one */
		} finally {
			setLoading(false);
		}
	}

	// Create-mode: pre-fill once on mount when empty. Edit-mode never auto-overwrites.
	useEffect(() => {
		if (mode === "create" && !value && !prefilled.current) {
			prefilled.current = true;
			void regenerate();
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
				aria-label="Generate employee code"
				onClick={regenerate}
			>
				<RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
			</Button>
		</div>
	);
}
