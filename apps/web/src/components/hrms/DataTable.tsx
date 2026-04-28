import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export interface Column<T> {
	key: string;
	header: ReactNode;
	render: (row: T) => ReactNode;
	sortable?: boolean;
	sortValue?: (row: T) => number | string;
	width?: string;
	align?: "left" | "right" | "center";
}

export interface DataTableProps<T> {
	rows: T[];
	columns: Column<T>[];
	rowKey: (row: T) => string;
	onRowClick?: (row: T) => void;
	emptyState?: ReactNode;
	className?: string;
}

export function DataTable<T>({
	rows,
	columns,
	rowKey,
	onRowClick,
	emptyState,
	className,
}: DataTableProps<T>) {
	const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
		null,
	);

	const sorted = useMemo(() => {
		if (!sort) return rows;
		const col = columns.find((c) => c.key === sort.key);
		if (!col) return rows;
		const getValue = col.sortValue ?? ((r: T) => String(col.render(r)));
		return [...rows].sort((a, b) => {
			const va = getValue(a);
			const vb = getValue(b);
			if (va < vb) return sort.dir === "asc" ? -1 : 1;
			if (va > vb) return sort.dir === "asc" ? 1 : -1;
			return 0;
		});
	}, [rows, columns, sort]);

	if (rows.length === 0 && emptyState) {
		return <div className={className}>{emptyState}</div>;
	}

	return (
		<table className={cn("w-full text-body", className)}>
			<thead>
				<tr>
					{columns.map((col) => {
						const isSorted = sort?.key === col.key;
						const align = col.align ?? "left";
						return (
							<th
								key={col.key}
								className={cn(
									"px-2.5 py-2 border-b border-border-subtle text-left",
									align === "right" && "text-right",
									align === "center" && "text-center",
								)}
								style={col.width ? { width: col.width } : undefined}
							>
								{col.sortable ? (
									<button
										key={col.key}
										type="button"
										className="inline-flex items-center gap-1 text-label uppercase text-text-tertiary hover:text-text-secondary"
										onClick={() =>
											setSort((s) =>
												s?.key === col.key
													? {
															key: col.key,
															dir: s.dir === "asc" ? "desc" : "asc",
														}
													: { key: col.key, dir: "asc" },
											)
										}
									>
										{col.header}
										{isSorted &&
											(sort?.dir === "asc" ? (
												<ChevronUp className="size-3" />
											) : (
												<ChevronDown className="size-3" />
											))}
									</button>
								) : (
									<span
										key={col.key}
										className="text-label uppercase text-text-tertiary"
									>
										{col.header}
									</span>
								)}
							</th>
						);
					})}
				</tr>
			</thead>
			<tbody>
				{sorted.map((row) => (
					<tr
						key={rowKey(row)}
						className={cn(
							"border-b border-border-subtle text-text-secondary",
							onRowClick &&
								"cursor-pointer hover:bg-surface-hover transition-colors duration-fast",
						)}
						onClick={() => onRowClick?.(row)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") onRowClick?.(row);
						}}
					>
						{columns.map((col) => (
							<td
								key={col.key}
								className={cn(
									"px-2.5 py-2.5",
									col.align === "right" && "text-right",
									col.align === "center" && "text-center",
								)}
							>
								{col.render(row)}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}
