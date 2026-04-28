import { useEffect, useState } from "react";

type Listener = (open: boolean) => void;
const listeners = new Set<Listener>();
let _open = false;

export function openCommandPalette() {
	_open = true;
	for (const l of listeners) l(true);
}

export function closeCommandPalette() {
	_open = false;
	for (const l of listeners) l(false);
}

export function useCommandPalette(): {
	open: boolean;
	setOpen: (v: boolean) => void;
} {
	const [open, setLocal] = useState(_open);
	useEffect(() => {
		const fn: Listener = (v) => setLocal(v);
		listeners.add(fn);
		return () => {
			listeners.delete(fn);
		};
	}, []);
	return {
		open,
		setOpen: (v) => {
			if (v) openCommandPalette();
			else closeCommandPalette();
		},
	};
}
