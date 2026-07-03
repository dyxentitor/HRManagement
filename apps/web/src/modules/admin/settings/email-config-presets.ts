export type Encryption = "none" | "ssl" | "starttls";

export interface ProviderPreset {
	id: string;
	label: string;
	host: string;
	port: number;
	encryption: Encryption;
	hint?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
	{
		id: "m365",
		label: "Microsoft 365",
		host: "smtp.office365.com",
		port: 587,
		encryption: "starttls",
		hint: "Use an app password / SMTP AUTH.",
	},
	{
		id: "gmail",
		label: "Google Workspace",
		host: "smtp.gmail.com",
		port: 587,
		encryption: "starttls",
		hint: "App password required.",
	},
	{
		id: "sendgrid",
		label: "SendGrid",
		host: "smtp.sendgrid.net",
		port: 587,
		encryption: "starttls",
		hint: "Username is literally 'apikey'.",
	},
	{
		id: "ses",
		label: "Amazon SES",
		host: "email-smtp.us-east-1.amazonaws.com",
		port: 587,
		encryption: "starttls",
		hint: "Swap the region in the host.",
	},
	{
		id: "mailgun",
		label: "Mailgun",
		host: "smtp.mailgun.org",
		port: 587,
		encryption: "starttls",
	},
	{ id: "custom", label: "Custom", host: "", port: 587, encryption: "starttls" },
];

export const ENCRYPTION_OPTIONS: { value: Encryption; label: string }[] = [
	{ value: "none", label: "None" },
	{ value: "ssl", label: "SSL/TLS" },
	{ value: "starttls", label: "STARTTLS" },
];
