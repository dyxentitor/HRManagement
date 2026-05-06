import { ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

interface Option {
	id: string;
	full_name: string;
	role_title?: string;
}

interface Props {
	value: string | null;
	excludeIds: string[];
	options: Option[];
	onChange: (id: string | null) => void;
}

export function ManagerPicker({ value, excludeIds, options, onChange }: Props) {
	const [open, setOpen] = useState(false);

	const visible = useMemo(() => {
		const exclude = new Set(excludeIds);
		return options.filter((o) => !exclude.has(o.id));
	}, [options, excludeIds]);

	const selectedLabel = options.find((o) => o.id === value)?.full_name ?? "";

	function pick(id: string | null) {
		onChange(id);
		setOpen(false);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					role="combobox"
					aria-label="Manager"
					aria-expanded={open}
					className="w-full justify-between bg-canvas border-border-subtle text-text-primary font-normal"
				>
					{selectedLabel || (
						<span className="text-text-tertiary">Select a manager…</span>
					)}
					<ChevronsUpDown className="size-4 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
				<Command>
					<CommandInput placeholder="Search by name…" />
					<CommandList>
						<CommandEmpty>No matches.</CommandEmpty>
						<CommandGroup>
							<CommandItem
								value="__none__"
								onSelect={() => pick(null)}
								className="text-text-tertiary"
							>
								(No manager)
							</CommandItem>
							{visible.map((o) => (
								<CommandItem
									key={o.id}
									value={`${o.full_name} ${o.role_title ?? ""}`}
									onSelect={() => pick(o.id)}
								>
									<div className="flex flex-col">
										<span>{o.full_name}</span>
										{o.role_title && (
											<span className="text-small text-text-tertiary">
												{o.role_title}
											</span>
										)}
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
