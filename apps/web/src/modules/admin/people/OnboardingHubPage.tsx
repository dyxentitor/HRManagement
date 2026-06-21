import { InvitationsColumn } from "./InvitationsColumn";
import { OnboardingColumn } from "./OnboardingColumn";

/** People → Onboarding: invitations (left) + onboarding progress (right). */
export default function OnboardingHubPage() {
	return (
		<div className="grid lg:grid-cols-2 gap-6 items-start">
			<InvitationsColumn />
			<OnboardingColumn />
		</div>
	);
}
