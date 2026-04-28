import { X } from "lucide-react";
import type { ReactNode } from "react";

import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";

export interface DetailPanelProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	footer?: ReactNode;
}

export function DetailPanel({
	open,
	onClose,
	title,
	children,
	footer,
}: DetailPanelProps) {
	return (
		<Sheet open={open} onOpenChange={(v) => !v && onClose()}>
			<SheetContent
				side="right"
				className="bg-surface-elevated border-l border-accent-500/20 shadow-panel w-[320px] sm:max-w-[320px] flex flex-col p-0"
			>
				<SheetHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
					<SheetTitle className="text-h3 text-text-primary">{title}</SheetTitle>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close detail panel"
						className="text-text-tertiary hover:text-text-primary transition-colors duration-fast"
					>
						<X className="size-4" />
					</button>
				</SheetHeader>
				<div className="flex-1 overflow-y-auto px-4 py-3 text-body text-text-secondary">
					{children}
				</div>
				{footer && (
					<footer className="px-4 py-3 border-t border-border-subtle">
						{footer}
					</footer>
				)}
			</SheetContent>
		</Sheet>
	);
}
