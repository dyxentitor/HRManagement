import type { Encryption } from "./email-config-presets";

export interface EmailConfigForm {
	enabled: boolean;
	smtp_host: string;
	smtp_port: number;
	encryption: Encryption;
	use_auth: boolean;
	smtp_username: string;
	smtp_password: string;
	sender_name: string;
	sender_email: string;
	reply_to: string;
	connection_timeout: number;
	rate_limit_per_minute: number;
	max_retry_attempts: number;
	retry_interval_seconds: number;
	signature: string;
	provider_preset: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field-level errors. Mirrors the backend serializer: numeric/format checks
 * are unconditional; host/sender/auth requirements only bite when enabling. */
export function validate(f: EmailConfigForm, hasPassword: boolean): Record<string, string> {
	const e: Record<string, string> = {};
	if (f.smtp_port < 1 || f.smtp_port > 65535) e.smtp_port = "Port must be 1–65535.";
	if (f.connection_timeout < 1 || f.connection_timeout > 300)
		e.connection_timeout = "1–300 seconds.";
	if (f.rate_limit_per_minute < 1 || f.rate_limit_per_minute > 1000)
		e.rate_limit_per_minute = "1–1000.";
	if (f.max_retry_attempts < 0 || f.max_retry_attempts > 10) e.max_retry_attempts = "0–10.";
	if (f.retry_interval_seconds < 1 || f.retry_interval_seconds > 3600)
		e.retry_interval_seconds = "1–3600 seconds.";
	if (f.reply_to && !EMAIL_RE.test(f.reply_to)) e.reply_to = "Enter a valid email address.";
	if (f.sender_email && !EMAIL_RE.test(f.sender_email))
		e.sender_email = "Enter a valid email address.";

	if (f.enabled) {
		if (!f.smtp_host.trim()) e.smtp_host = "Required when email is enabled.";
		if (!f.sender_email.trim()) e.sender_email = e.sender_email ?? "Required when email is enabled.";
		if (f.use_auth) {
			if (!f.smtp_username.trim()) e.smtp_username = "Required when authentication is on.";
			if (!f.smtp_password && !hasPassword)
				e.smtp_password = "Required when authentication is on.";
		}
	}
	return e;
}

/** Soft, non-blocking hints surfaced in the live summary card. */
export function warnings(f: EmailConfigForm): string[] {
	const w: string[] = [];
	if (f.smtp_port === 465 && f.encryption !== "ssl")
		w.push("Port 465 usually requires SSL/TLS encryption.");
	if (f.smtp_port === 587 && f.encryption === "ssl")
		w.push("Port 587 usually uses STARTTLS, not SSL/TLS.");
	if (f.use_auth && !f.smtp_username.trim())
		w.push("Authentication is on but no username is set.");
	if (f.encryption === "none") w.push("No encryption — credentials will be sent in clear text.");
	if (f.enabled && !f.smtp_host.trim())
		w.push("Email is enabled but no SMTP host is configured.");
	return w;
}
