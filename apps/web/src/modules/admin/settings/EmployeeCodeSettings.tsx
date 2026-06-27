import { Input } from "@/components/ui/input";

export type CodeCfg = {
	prefix: string;
	separator: "-" | "/" | "";
	include_year: boolean;
	year_digits: 2 | 4;
	counter_width: number;
	reset: "yearly" | "never";
	autofill: boolean;
};

export const DEFAULT_CFG: CodeCfg = {
	prefix: "EMP",
	separator: "-",
	include_year: true,
	year_digits: 4,
	counter_width: 4,
	reset: "yearly",
	autofill: true,
};

export function previewCode(cfg: CodeCfg): string {
	const year = new Date().getFullYear();
	const ys = cfg.year_digits === 2 ? String(year % 100).padStart(2, "0") : String(year);
	const sep = cfg.separator;
	const head = cfg.prefix + sep + (cfg.include_year ? ys + sep : "");
	return head + "1".padStart(Math.min(6, Math.max(3, cfg.counter_width)), "0");
}

const SEG = "text-[11px] px-2.5 py-1 rounded-md cursor-pointer disabled:opacity-40";

export function EmployeeCodeSettings({
	value,
	onChange,
}: {
	value: CodeCfg;
	onChange: (c: CodeCfg) => void;
}) {
	const set = <K extends keyof CodeCfg>(k: K, v: CodeCfg[K]) => {
		const next = { ...value, [k]: v };
		if (k === "include_year" && v === false) next.reset = "never"; // no year ⇒ continuous
		onChange(next);
	};
	const seg = (active: boolean) =>
		`${SEG} ${
			active
				? "bg-accent-500/15 text-accent-100 font-semibold"
				: "text-text-secondary hover:text-text-primary"
		}`;

	return (
		<div className="space-y-4">
			<div className="rounded-xl border border-accent-500/40 bg-accent-500/10 p-4 flex items-center justify-between">
				<div>
					<p className="text-[9px] uppercase tracking-wide text-accent-200">
						Next code will look like
					</p>
					<p className="font-mono text-h2 text-text-primary">{previewCode(value)}</p>
				</div>
				<p className="text-[11px] text-text-tertiary">
					prefix · {value.include_year ? "year · " : ""}counter
				</p>
			</div>

			<p className="layer-eyebrow">Format</p>
			<div className="grid grid-cols-[140px_1fr] gap-2 items-center">
				<span className="text-small text-text-secondary">Prefix</span>
				<Input
					aria-label="Employee code prefix"
					className="max-w-[140px]"
					value={value.prefix}
					onChange={(e) => set("prefix", e.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 8))}
				/>

				<span className="text-small text-text-secondary">Separator</span>
				<div className="flex gap-1">
					{(["-", "/", ""] as const).map((s) => (
						<button
							key={s || "none"}
							type="button"
							className={seg(value.separator === s)}
							onClick={() => set("separator", s)}
						>
							{s === "" ? "none" : s}
						</button>
					))}
				</div>

				<span className="text-small text-text-secondary">Include year</span>
				<div className="flex items-center gap-3">
					<input
						type="checkbox"
						aria-label="Include year"
						checked={value.include_year}
						onChange={(e) => set("include_year", e.target.checked)}
					/>
					{value.include_year && (
						<div className="flex gap-1">
							<button
								type="button"
								className={seg(value.year_digits === 4)}
								onClick={() => set("year_digits", 4)}
							>
								2026
							</button>
							<button
								type="button"
								className={seg(value.year_digits === 2)}
								onClick={() => set("year_digits", 2)}
							>
								26
							</button>
						</div>
					)}
				</div>

				<span className="text-small text-text-secondary">Counter width</span>
				<select
					aria-label="Counter width"
					className="bg-canvas border border-border-subtle rounded px-2 py-1.5 text-small max-w-[170px]"
					value={value.counter_width}
					onChange={(e) => set("counter_width", Number(e.target.value))}
				>
					{[3, 4, 5, 6].map((w) => (
						<option key={w} value={w}>
							{w} digits · {"1".padStart(w, "0")}
						</option>
					))}
				</select>
			</div>

			<p className="layer-eyebrow">Behaviour</p>
			<div className="grid grid-cols-[140px_1fr] gap-2 items-center">
				<span className="text-small text-text-secondary">Reset counter</span>
				<div className="flex gap-1">
					<button
						type="button"
						disabled={!value.include_year}
						className={seg(value.reset === "yearly")}
						onClick={() => set("reset", "yearly")}
					>
						Every year
					</button>
					<button
						type="button"
						className={seg(value.reset === "never")}
						onClick={() => set("reset", "never")}
					>
						Never
					</button>
				</div>

				<span className="text-small text-text-secondary">Auto-fill new forms</span>
				<input
					type="checkbox"
					aria-label="Auto-fill new forms"
					checked={value.autofill}
					onChange={(e) => set("autofill", e.target.checked)}
				/>
			</div>
		</div>
	);
}
