const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export interface InvitationPreview {
	full_name: string;
	email: string;
	org_name: string;
	expires_at: string;
	status: string;
}

export async function verifyInvitation(token: string): Promise<InvitationPreview> {
	const r = await fetch(
		`${BASE_URL}/api/v1/invitations/verify/?token=${encodeURIComponent(token)}`,
	);
	if (!r.ok) throw new Error("This invitation link is invalid or has expired.");
	return r.json();
}

export async function activateInvitation(token: string, password: string): Promise<void> {
	const r = await fetch(`${BASE_URL}/api/v1/invitations/activate/`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ token, password }),
	});
	if (!r.ok) {
		const b = (await r.json().catch(() => ({}))) as {
			token?: string[];
			password?: string[];
			detail?: string;
		};
		throw new Error(b.token?.[0] || b.password?.[0] || b.detail || "Activation failed.");
	}
}
