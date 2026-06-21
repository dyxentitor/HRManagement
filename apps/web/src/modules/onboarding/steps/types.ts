export type StepKey = "welcome" | "security" | "profile" | "preferences" | "review" | "ready";

export interface InvitationPreview {
	full_name: string;
	email: string;
	org_name: string;
}

export interface StepCtx {
	mode: "activate" | "resume";
	token: string;
	preview: InvitationPreview | null;
	goNext: () => void;
	goBack: () => void;
	goTo: (step: StepKey) => void;
	finish: () => void;
	markSaved: () => void;
}
