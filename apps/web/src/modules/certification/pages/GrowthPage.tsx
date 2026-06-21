import { useFeature } from "@/lib/feature-flags";

import { CertificationsColumn } from "../components/CertificationsColumn";
import { TrainingColumn } from "../components/TrainingColumn";

/**
 * Combined "Growth" workspace — Certifications (left) + Training (right) as two
 * big columns. Each column renders only if its module is enabled; with both on
 * it's the side-by-side layout, with one it spans full width.
 */
export default function GrowthPage() {
	const hasCert = useFeature("certification");
	const hasTraining = useFeature("training");
	const both = hasCert && hasTraining;

	return (
		<div className={both ? "grid lg:grid-cols-2 gap-5 items-start" : "max-w-2xl"}>
			{hasCert && <CertificationsColumn />}
			{hasTraining && <TrainingColumn />}
			{!hasCert && !hasTraining && (
				<p className="text-text-tertiary text-small">
					Certifications and Training are turned off for your organisation.
				</p>
			)}
		</div>
	);
}
