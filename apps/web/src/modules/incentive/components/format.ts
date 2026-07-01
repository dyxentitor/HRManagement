/** Shared number formatting for the incentive UI (mandays-first, RM subtle). */
export const md = (v: string | number) =>
	Number(v).toLocaleString("en-MY", { maximumFractionDigits: 2 });

export const rm = (v: string | number) =>
	`RM ${Number(v).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;
