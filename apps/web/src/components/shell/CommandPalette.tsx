import { useEffect } from "react";

import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { useCommandPalette } from "@/lib/cmdk";

export function CommandPalette() {
	const { open, setOpen } = useCommandPalette();

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen(!open);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, setOpen]);

	return (
		<CommandDialog open={open} onOpenChange={setOpen}>
			<CommandInput placeholder="Search pages, employees, actions…" />
			<CommandList>
				<CommandEmpty>
					No results — full search lands in v1.1 polish.
				</CommandEmpty>
				<CommandGroup heading="Pages">
					<CommandItem onSelect={() => setOpen(false)}>Dashboard</CommandItem>
					<CommandItem onSelect={() => setOpen(false)}>My Profile</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
