export const EVENT_LABELS: Record<string, string> = {
	"auth.login": "Successful sign-in",
	"auth.password_changed": "Password changed",
	"auth.mfa_enabled": "Two-step verification enabled",
	"auth.mfa_disabled": "Two-step verification disabled",
	"leave.submitted": "Leave request submitted",
	"leave.approved": "Leave request approved",
	"leave.rejected": "Leave request rejected",
	"leave.cancelled": "Leave request cancelled",
	"leave.replacement_granted": "Replacement leave granted",
	"claim.submitted": "Claim submitted",
	"claim.approved": "Claim approved",
	"claim.rejected": "Claim rejected",
	"claim.reimbursed": "Claim reimbursed",
	"kpi.cycle_opens_self_review": "KPI self-review window opens",
	"kpi.cycle_opens_manager_review": "KPI manager review opens",
	"kpi.review_submitted_self": "Employee submitted self-review",
	"kpi.review_submitted_manager": "Manager submitted review",
	"cert.expiring_soon": "Certification expiring within 30 days",
	"employee.bank_changed_self": "Bank details changed",
	"employee.contract_ending_soon": "Contract ending within 30 days",
	"employee.probation_ending_soon": "Probation ending within 30 days",
	"schedule.roster_published": "New roster published",
};

/** Return the domain prefix of an event type, e.g. "auth" for "auth.login" */
export function eventDomain(type: string): string {
	return type.split(".")[0] ?? type;
}

/** Human-friendly domain heading */
export const DOMAIN_LABELS: Record<string, string> = {
	auth: "Account & security",
	leave: "Leave",
	claim: "Claims",
	kpi: "KPI & performance",
	cert: "Certifications",
	employee: "Employee",
	schedule: "Schedule",
};

export function getEventLabel(type: string): string {
	return EVENT_LABELS[type] ?? type;
}

export function getDomainLabel(domain: string): string {
	return DOMAIN_LABELS[domain] ?? domain;
}
