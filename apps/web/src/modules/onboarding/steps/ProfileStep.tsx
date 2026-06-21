import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { type EmployeeWritePayload, employeeApi } from "@/modules/employee/api";
import { AvatarUpload } from "@/modules/employee/components/AvatarUpload";
import { StepFooter, StepHeader } from "./chrome";
import type { StepCtx } from "./types";

type Me = Record<string, string | null | undefined> & {
	full_name?: string;
	photo_url?: string | null;
};

function Field({
	label,
	value,
	onChange,
	placeholder,
	span,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	span?: boolean;
}) {
	return (
		<label className={`flex flex-col gap-1 ${span ? "sm:col-span-2" : ""}`}>
			<span className="text-label uppercase text-text-tertiary">{label}</span>
			<Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
		</label>
	);
}

export function ProfileStep({ ctx }: { ctx: StepCtx }) {
	const [me, setMe] = useState<Me | null>(null);
	const [d, setD] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			const profile = (await employeeApi.getMe()) as Me | null;
			setMe(profile);
			setD({
				phone: profile?.phone ?? "",
				alt_phone: profile?.alt_phone ?? "",
				address_line1: profile?.address_line1 ?? "",
				city: profile?.city ?? "",
				postcode: profile?.postcode ?? "",
				emergency_contact_name: profile?.emergency_contact_name ?? "",
				emergency_contact_phone: profile?.emergency_contact_phone ?? "",
				emergency_contact_relationship: profile?.emergency_contact_relationship ?? "",
			});
		})();
	}, []);

	const set = (k: string) => (v: string) => setD((p) => ({ ...p, [k]: v }));

	async function save() {
		setError(null);
		setBusy(true);
		try {
			await employeeApi.updateMe(d as Partial<EmployeeWritePayload>);
			ctx.markSaved();
			ctx.goNext();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not save your details.");
		} finally {
			setBusy(false);
		}
	}

	if (me === null) return <Skeleton className="h-72 rounded-xl" />;

	return (
		<div className="flex flex-col h-full">
			<StepHeader
				n="Step 3"
				title="Tell us how to reach you"
				subtitle="We pre-filled what HR had — add or correct anything. You can change it later in your profile."
			/>
			<div className="flex items-start gap-5">
				<AvatarUpload
					photoUrl={me.photo_url ?? null}
					fullName={me.full_name ?? "You"}
					onUploaded={() => undefined}
					onDeleted={() => undefined}
				/>
				<div className="grid sm:grid-cols-2 gap-3 flex-1">
					<Field label="Mobile" value={d.phone} onChange={set("phone")} placeholder="+60…" />
					<Field
						label="Alt phone"
						value={d.alt_phone}
						onChange={set("alt_phone")}
						placeholder="optional"
					/>
					<Field label="Address" value={d.address_line1} onChange={set("address_line1")} span />
					<Field label="City" value={d.city} onChange={set("city")} />
					<Field label="Postcode" value={d.postcode} onChange={set("postcode")} />
					<div className="sm:col-span-2 border-t border-border-subtle pt-2 mt-1">
						<span className="text-label uppercase text-text-tertiary">Emergency contact</span>
					</div>
					<Field
						label="Name"
						value={d.emergency_contact_name}
						onChange={set("emergency_contact_name")}
					/>
					<Field
						label="Phone"
						value={d.emergency_contact_phone}
						onChange={set("emergency_contact_phone")}
					/>
					<Field
						label="Relationship"
						value={d.emergency_contact_relationship}
						onChange={set("emergency_contact_relationship")}
						span
					/>
				</div>
			</div>
			{error && <p className="text-small text-coral mt-3">{error}</p>}
			<StepFooter
				onBack={ctx.goBack}
				primaryLabel={busy ? "Saving…" : "Save & continue →"}
				onPrimary={save}
				primaryDisabled={busy}
				secondaryLabel="Skip for now"
				onSecondary={ctx.goNext}
			/>
		</div>
	);
}
