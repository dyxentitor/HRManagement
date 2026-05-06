import { useMemo, useState } from "react";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";

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
	const [query, setQuery] = useState("");

	const visible = useMemo(() => {
		const exclude = new Set(excludeIds);
		return options.filter((o) => !exclude.has(o.id));
	}, [options, excludeIds]);

	const selectedLabel = options.find((o) => o.id === value)?.full_name ?? "";

	return (
		<Command className="border border-border-subtle rounded-md">
			<CommandInput
				aria-label="Manager"
				placeholder={selectedLabel || "Search by name…"}
				value={query}
				onValueChange={setQuery}
			/>
			<CommandList>
				<CommandEmpty>No matches.</CommandEmpty>
				<CommandGroup>
					<CommandItem
						value="__none__"
						onSelect={() => onChange(null)}
						className="text-text-tertiary"
					>
						(No manager)
					</CommandItem>
					{visible.map((o) => (
						<CommandItem
							key={o.id}
							value={`${o.full_name} ${o.role_title ?? ""}`}
							onSelect={() => onChange(o.id)}
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
	);
}
