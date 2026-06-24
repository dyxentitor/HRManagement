import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DetailPanel } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Plus, Trash2 } from "lucide-react";

import { type Employee, employeeApi } from "@/modules/employee/api";
import {
	type AssignmentType,
	type CompleteOn,
	type QuestionDraft,
	type QuestionType,
	type Recurrence,
	assignmentsApi,
} from "../api";

const SELECT = "bg-canvas border border-border-subtle rounded px-2 py-1.5 text-small w-full";

type Kind = "org" | "employee" | "team_scope";

export function CreateAssignmentDrawer({
	open,
	onClose,
	onCreated,
	managerScoped,
}: {
	open: boolean;
	onClose: () => void;
	onCreated: () => void;
	/** Manager (create:team only) — locked to their direct reports. */
	managerScoped: boolean;
}) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [type, setType] = useState<AssignmentType>("task");
	const [linkUrl, setLinkUrl] = useState("");
	const [due, setDue] = useState("");
	const [kind, setKind] = useState<Kind>(managerScoped ? "team_scope" : "org");
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [picked, setPicked] = useState<string[]>([]);
	const [questions, setQuestions] = useState<QuestionDraft[]>([]);
	const [recurrence, setRecurrence] = useState<Recurrence>("none");
	const [recurrenceUntil, setRecurrenceUntil] = useState("");
	const [completeOn, setCompleteOn] = useState<CompleteOn>("manual");
	const [requiresEvidence, setRequiresEvidence] = useState(false);
	const [busy, setBusy] = useState(false);

	const addQuestion = () =>
		setQuestions((qs) => [
			...qs,
			{ text: "", qtype: "single_choice", options: [], required: true },
		]);
	const patchQuestion = (i: number, patch: Partial<QuestionDraft>) =>
		setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
	const removeQuestion = (i: number) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));

	useEffect(() => {
		if (open && !managerScoped)
			employeeApi
				.list()
				.then(setEmployees)
				.catch(() => setEmployees([]));
	}, [open, managerScoped]);

	async function submit() {
		if (!title.trim()) {
			toast.error("A title is required.");
			return;
		}
		if (kind === "employee" && picked.length === 0) {
			toast.error("Pick at least one employee.");
			return;
		}
		if (type === "questionnaire" && !questions.some((q) => q.text.trim())) {
			toast.error("Add at least one question.");
			return;
		}
		// manager "team_scope" sends kind:org — the backend intersects with their direct reports.
		const target =
			kind === "employee"
				? { kind: "employee" as const, ids: picked }
				: { kind: "org" as const, ids: [] };
		setBusy(true);
		try {
			await assignmentsApi.create({
				title: title.trim(),
				description: description.trim(),
				type,
				link_url: linkUrl.trim(),
				link_target: linkUrl.trim() ? (linkUrl.startsWith("/") ? "internal" : "external") : "none",
				default_due_date: due || null,
				target,
				recurrence,
				recurrence_until: recurrence !== "none" && recurrenceUntil ? recurrenceUntil : null,
				complete_on: type === "task" ? completeOn : "manual",
				requires_evidence: type === "task" ? requiresEvidence : false,
				questions:
					type === "questionnaire"
						? questions
								.filter((q) => q.text.trim())
								.map((q) => ({
									...q,
									options:
										q.qtype === "single_choice" || q.qtype === "multi_choice" ? q.options : [],
								}))
						: undefined,
			});
			toast.success("Assignment published");
			onCreated();
			onClose();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not create assignment");
		} finally {
			setBusy(false);
		}
	}

	return (
		<DetailPanel open={open} onClose={onClose} title="New assignment">
			<div className="space-y-3">
				<Field label="Title">
					<Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
				</Field>
				<Field label="Description (optional)">
					<Input
						aria-label="Description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</Field>
				<div className="grid grid-cols-2 gap-3">
					<Field label="Type">
						<select
							aria-label="Type"
							className={SELECT}
							value={type}
							onChange={(e) => setType(e.target.value as AssignmentType)}
						>
							<option value="task">Task</option>
							<option value="acknowledge">Acknowledge (read &amp; accept)</option>
							<option value="questionnaire">Questionnaire / poll</option>
						</select>
					</Field>
					<Field label="Due date (optional)">
						<Input
							aria-label="Due date"
							type="date"
							value={due}
							onChange={(e) => setDue(e.target.value)}
						/>
					</Field>
				</div>
				<Field label="Link (internal route or external URL, optional)">
					<Input
						aria-label="Link"
						placeholder="/me/profile  ·  https://forms.gle/…"
						value={linkUrl}
						onChange={(e) => setLinkUrl(e.target.value)}
					/>
				</Field>

				{type === "task" && (
					<Field label="Mark complete">
						<select
							aria-label="Mark complete"
							className={SELECT}
							value={completeOn}
							onChange={(e) => setCompleteOn(e.target.value as CompleteOn)}
						>
							<option value="manual">Manually (employee marks done)</option>
							<option value="profile_completed">Auto — when their profile is 100% complete</option>
							<option value="leave_requested">Auto — when they submit a leave request</option>
						</select>
					</Field>
				)}

				{type === "task" && (
					<label className="flex items-center gap-2 text-small text-text-secondary">
						<input
							type="checkbox"
							checked={requiresEvidence}
							onChange={(e) => setRequiresEvidence(e.target.checked)}
						/>
						Require a proof upload to complete
					</label>
				)}

				{type === "questionnaire" && (
					<div className="space-y-2 border border-border-subtle rounded-xl p-3">
						<p className="text-[10px] uppercase tracking-wide text-text-tertiary">Questions</p>
						{questions.map((q, i) => (
							<div key={i} className="glass-surface rounded-lg p-2.5 space-y-2">
								<div className="flex items-center gap-2">
									<Input
										aria-label={`Question ${i + 1}`}
										placeholder="Question text"
										value={q.text}
										onChange={(e) => patchQuestion(i, { text: e.target.value })}
										className="h-8"
									/>
									<button
										type="button"
										aria-label={`Remove question ${i + 1}`}
										onClick={() => removeQuestion(i)}
										className="text-text-tertiary hover:text-coral shrink-0"
									>
										<Trash2 className="size-4" />
									</button>
								</div>
								<div className="flex gap-2">
									<select
										aria-label={`Question ${i + 1} type`}
										className={`${SELECT} h-8`}
										value={q.qtype}
										onChange={(e) => patchQuestion(i, { qtype: e.target.value as QuestionType })}
									>
										<option value="single_choice">Single choice</option>
										<option value="multi_choice">Multiple choice</option>
										<option value="short_text">Short text</option>
										<option value="rating">Rating (1-5)</option>
									</select>
									{(q.qtype === "single_choice" || q.qtype === "multi_choice") && (
										<Input
											aria-label={`Question ${i + 1} options`}
											placeholder="Options, comma-separated"
											value={q.options.join(", ")}
											onChange={(e) =>
												patchQuestion(i, {
													options: e.target.value
														.split(",")
														.map((o) => o.trim())
														.filter(Boolean),
												})
											}
											className="h-8"
										/>
									)}
								</div>
							</div>
						))}
						<button
							type="button"
							onClick={addQuestion}
							className="inline-flex items-center gap-1.5 text-small text-accent-200 hover:text-accent-50"
						>
							<Plus className="size-4" /> Add question
						</button>
					</div>
				)}

				<Field label="Assign to">
					{managerScoped ? (
						<p className="text-small text-text-secondary glass-surface rounded-lg px-3 py-2">
							Your direct reports
						</p>
					) : (
						<select
							aria-label="Assign to"
							className={SELECT}
							value={kind}
							onChange={(e) => setKind(e.target.value as Kind)}
						>
							<option value="org">Everyone in the org</option>
							<option value="employee">Specific employees</option>
						</select>
					)}
				</Field>

				{kind === "employee" && !managerScoped && (
					<select
						aria-label="Employees"
						multiple
						className={`${SELECT} h-40`}
						value={picked}
						onChange={(e) => setPicked(Array.from(e.target.selectedOptions, (o) => o.value))}
					>
						{employees.map((emp) => (
							<option key={emp.id} value={emp.id}>
								{emp.full_name}
							</option>
						))}
					</select>
				)}

				<div className="grid grid-cols-2 gap-3">
					<Field label="Repeat">
						<select
							aria-label="Repeat"
							className={SELECT}
							value={recurrence}
							onChange={(e) => setRecurrence(e.target.value as Recurrence)}
						>
							<option value="none">Does not repeat</option>
							<option value="daily">Daily</option>
							<option value="weekly">Weekly</option>
							<option value="monthly">Monthly</option>
							<option value="yearly">Yearly</option>
						</select>
					</Field>
					{recurrence !== "none" && (
						<Field label="Repeat until (optional)">
							<Input
								aria-label="Repeat until"
								type="date"
								value={recurrenceUntil}
								onChange={(e) => setRecurrenceUntil(e.target.value)}
							/>
						</Field>
					)}
				</div>

				<Button onClick={submit} disabled={busy} className="soft-glow rounded-xl w-full">
					{recurrence === "none" ? "Publish assignment" : "Schedule recurring assignment"}
				</Button>
			</div>
		</DetailPanel>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</span>
			{children}
		</label>
	);
}
