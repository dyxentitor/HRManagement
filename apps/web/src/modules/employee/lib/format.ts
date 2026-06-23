/** Approximate tenure as "Xy Ym" from a hire date (— when absent). */
export function tenureFromHireDate(hireDate?: string): string {
	if (!hireDate) return "—";
	const months = Math.max(
		0,
		Math.floor((Date.now() - new Date(hireDate).getTime()) / (1000 * 60 * 60 * 24 * 30.42)),
	);
	return `${Math.floor(months / 12)}y ${months % 12}m`;
}

/** "15 Nov 2021" — full joined date (— when absent). */
export function formatJoinedDate(hireDate?: string): string {
	if (!hireDate) return "—";
	return new Date(hireDate).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}
