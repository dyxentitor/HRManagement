/**
 * Group permission codes by module label for the matrix UI.
 * We hard-code the grouping rather than fetching it because the catalogue
 * is small (~70 codes) and the labels are display-only.
 *
 * TODO: future GET /api/v1/org/permissions/ endpoint
 */
export interface PermissionGroup {
	module: string;
	perms: { code: string; label: string }[];
}

const GROUPS: Record<
	string,
	{ match: (code: string) => boolean; label: (code: string) => string }
> = {
	Identity: {
		match: (c) =>
			c.startsWith("user:") || c.startsWith("role:") || c.startsWith("audit:"),
		label: (c) => c,
	},
	Employee: {
		match: (c) => c.startsWith("employee:") || c.startsWith("department:"),
		label: (c) => c,
	},
	Leave: {
		match: (c) => c.startsWith("leave:"),
		label: (c) => c,
	},
	Schedule: {
		match: (c) => c.startsWith("schedule:") || c.startsWith("attendance:"),
		label: (c) => c,
	},
	Claims: {
		match: (c) => c.startsWith("claim:"),
		label: (c) => c,
	},
	Payroll: {
		match: (c) => c.startsWith("payroll:") || c.startsWith("payslip:"),
		label: (c) => c,
	},
	KPI: {
		match: (c) => c.startsWith("kpi:"),
		label: (c) => c,
	},
	Certification: {
		match: (c) => c.startsWith("cert:"),
		label: (c) => c,
	},
	Training: {
		match: (c) => c.startsWith("training:"),
		label: (c) => c,
	},
	Reports: {
		match: (c) => c.startsWith("report:"),
		label: (c) => c,
	},
	Notifications: {
		match: (c) => c.startsWith("notif:") || c.startsWith("approvals:"),
		label: (c) => c,
	},
	Org: {
		match: (c) => c.startsWith("org:"),
		label: (c) => c,
	},
};

const MODULE_ORDER = [
	"Identity",
	"Employee",
	"Org",
	"Leave",
	"Schedule",
	"Claims",
	"Payroll",
	"KPI",
	"Certification",
	"Training",
	"Reports",
	"Notifications",
];

export function groupPermissions(allCodes: string[]): PermissionGroup[] {
	const buckets: Record<string, { code: string; label: string }[]> = {};
	const others: { code: string; label: string }[] = [];

	for (const code of allCodes) {
		let placed = false;
		for (const [moduleName, def] of Object.entries(GROUPS)) {
			if (def.match(code)) {
				if (!buckets[moduleName]) buckets[moduleName] = [];
				buckets[moduleName].push({ code, label: def.label(code) });
				placed = true;
				break;
			}
		}
		if (!placed) others.push({ code, label: code });
	}

	const result: PermissionGroup[] = [];
	for (const m of MODULE_ORDER) {
		if (buckets[m]) {
			buckets[m].sort((a, b) => a.code.localeCompare(b.code));
			result.push({ module: m, perms: buckets[m] });
		}
	}
	if (others.length) {
		others.sort((a, b) => a.code.localeCompare(b.code));
		result.push({ module: "Other", perms: others });
	}
	return result;
}
