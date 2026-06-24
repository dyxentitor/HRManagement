import {
	ArrowLeft,
	ClipboardList,
	GripVertical,
	ListChecks,
	Plus,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCan } from "@/lib/perm";
import { cn } from "@/lib/utils";

import { type Employee, employeeApi } from "@/modules/employee/api";
import {
	type AssignmentType,
	type CompleteOn,
	type QuestionDraft,
	type QuestionType,
	type Recurrence,
	assignmentsApi,
} from "../api";

const SELECT =
	"bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-small w-full focus:outline-none focus:ring-2 focus:ring-accent-500/40";

const TYPES: { value: AssignmentType; label: string; desc: string; icon: typeof ListChecks }[] = [
	{
		value: "task",
		label: "Task",
		desc: "Do something, optionally at a link — then mark done.",
		icon: ListChecks,
	},
	{
		value: "acknowledge",
		label: "Acknowledge",
		desc: "Read a policy or notice and accept it.",
		icon: ShieldCheck,
	},
	{
		value: "questionnaire",
		label: "Questionnaire / poll",
		desc: "Collect answers with your own questions.",
		icon: ClipboardList,
	},
];

type Kind = "org" | "employee" | "team_scope";

export default function AssignmentCreatePage() {
	const navigate = useNavigate();
	const canReadOrg = useCan("assignment:read:org");
	const canTeam = useCan("assignment:create:team");
	const managerScoped = !canReadOrg && canTeam;

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [type, setType] = useState<AssignmentType>("task");
	const [linkUrl, setLinkUrl] = useState("");
	const [due, setDue] = useState("");
	const [completeOn, setCompleteOn] = useState<CompleteOn>("manual");
	const [requiresEvidence, setRequiresEvidence] = useState(false);
	const [recurrence, setRecurrence] = useState<Recurrence>("none");
	const [recurrenceUntil, setRecurrenceUntil] = useState("");
	const [kind, setKind] = useState<Kind>(managerScoped ? "team_scope" : "org");
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [picked, setPicked] = useState<string[]>([]);
	const [questions, setQuestions] = useState<QuestionDraft[]>([]);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!managerScoped)
			employeeApi
				.list()
				.then(setEmployees)
				.catch(() => setEmployees([]));
	}, [managerScoped]);

	if (!canReadOrg && !canTeam) {
		return (
			<div className="space-y-4">
				<PageHeader breadcrumb="Assignments" title="Create assignment" />
				<p className="text-small text-text-tertiary glass-surface rounded-xl p-6">
					You don't have permission to create assignments.
				</p>
			</div>
		);
	}

	const addQuestion = () =>
		setQuestions((qs) => [
			...qs,
			{ text: "", qtype: "single_choice", options: [], required: true },
		]);
	const patchQuestion = (i: number, patch: Partial<QuestionDraft>) =>
		setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
	const removeQuestion = (i: number) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));

	async function submit() {
		if (!title.trim()) return toast.error("Give the assignment a title.");
		if (kind === "employee" && picked.length === 0) return toast.error("Pick at least one person.");
		if (type === "questionnaire" && !questions.some((q) => q.text.trim()))
			return toast.error("Add at least one question.");

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
			toast.success(
				recurrence === "none" ? "Assignment published" : "Recurring assignment scheduled",
			);
			navigate("/admin/assignments");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not create assignment");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-5 max-w-3xl pb-28">
			<PageHeader
				breadcrumb="Assignments"
				title="Create assignment"
				subtitle="Assign a task, policy acknowledgement, or questionnaire — and track who's done."
				actions={
					<Button asChild variant="ghost" size="sm" className="rounded-xl">
						<Link to="/admin/assignments">
							<ArrowLeft className="size-4 mr-1" /> Back
						</Link>
					</Button>
				}
			/>

			{/* Type chooser — the thesis of the form */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
				{TYPES.map((t) => {
					const Icon = t.icon;
					const active = type === t.value;
					return (
						<button
							key={t.value}
							type="button"
							onClick={() => setType(t.value)}
							className={cn(
								"text-left rounded-2xl p-4 border transition-all",
								active
									? "border-accent-500/60 bg-accent-500/10 soft-glow"
									: "glass-surface border-border-subtle hover:border-border-strong",
							)}
						>
							<Icon
								className={cn("size-5 mb-2", active ? "text-accent-100" : "text-text-tertiary")}
							/>
							<p className="text-body text-text-primary">{t.label}</p>
							<p className="text-[11px] text-text-tertiary mt-0.5 leading-snug">{t.desc}</p>
						</button>
					);
				})}
			</div>

			<Section eyebrow="Details">
				<Field label="Title">
					<Input
						aria-label="Title"
						placeholder="e.g. Read the 2026 Code of Conduct"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
				</Field>
				<Field label="Description (optional)">
					<textarea
						aria-label="Description"
						className={`${SELECT} min-h-[72px] resize-y`}
						placeholder="Add context or instructions…"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</Field>
			</Section>

			{type !== "questionnaire" && (
				<Section eyebrow={type === "acknowledge" ? "Document" : "Link & completion"}>
					<Field
						label={
							type === "acknowledge"
								? "Link to the document (internal route or external URL, optional)"
								: "Link (internal route or external URL, optional)"
						}
					>
						<Input
							aria-label="Link"
							placeholder="/me/profile  ·  https://forms.gle/…"
							value={linkUrl}
							onChange={(e) => setLinkUrl(e.target.value)}
						/>
					</Field>

					{type === "task" && (
						<>
							<Field label="Mark complete">
								<select
									aria-label="Mark complete"
									className={SELECT}
									value={completeOn}
									onChange={(e) => setCompleteOn(e.target.value as CompleteOn)}
								>
									<option value="manual">Manually (employee marks done)</option>
									<option value="profile_completed">
										Auto — when their profile is 100% complete
									</option>
									<option value="leave_requested">Auto — when they submit a leave request</option>
								</select>
							</Field>
							<label className="flex items-center gap-2 text-small text-text-secondary">
								<input
									type="checkbox"
									checked={requiresEvidence}
									onChange={(e) => setRequiresEvidence(e.target.checked)}
								/>
								Require a proof upload to complete
							</label>
						</>
					)}
				</Section>
			)}

			{type === "questionnaire" && (
				<Section
					eyebrow="Questions"
					action={
						<button
							type="button"
							onClick={addQuestion}
							className="inline-flex items-center gap-1.5 text-small text-accent-200 hover:text-accent-50"
						>
							<Plus className="size-4" /> Add question
						</button>
					}
				>
					{questions.length === 0 ? (
						<p className="text-small text-text-tertiary">No questions yet — add your first.</p>
					) : (
						<ul className="space-y-2">
							{questions.map((q, i) => (
								<li key={i} className="rounded-xl border border-border-subtle p-3 space-y-2">
									<div className="flex items-center gap-2">
										<GripVertical className="size-4 text-text-tertiary shrink-0" />
										<span className="text-[11px] text-text-tertiary w-4">{i + 1}</span>
										<Input
											aria-label={`Question ${i + 1}`}
											placeholder="Question text"
											value={q.text}
											onChange={(e) => patchQuestion(i, { text: e.target.value })}
											className="h-9"
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
									<div className="flex gap-2 pl-10">
										<select
											aria-label={`Question ${i + 1} type`}
											className={`${SELECT} h-9`}
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
												className="h-9"
											/>
										)}
									</div>
								</li>
							))}
						</ul>
					)}
				</Section>
			)}

			<Section eyebrow="Audience">
				{managerScoped ? (
					<p className="text-small text-text-secondary glass-surface rounded-lg px-3 py-2">
						Your direct reports
					</p>
				) : (
					<>
						<Field label="Assign to">
							<select
								aria-label="Assign to"
								className={SELECT}
								value={kind}
								onChange={(e) => setKind(e.target.value as Kind)}
							>
								<option value="org">Everyone in the org</option>
								<option value="employee">Specific people</option>
							</select>
						</Field>
						{kind === "employee" && (
							<select
								aria-label="People"
								multiple
								className={`${SELECT} h-48`}
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
					</>
				)}
			</Section>

			<Section eyebrow="Schedule">
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
					<Field label="Due date (optional)">
						<Input
							aria-label="Due date"
							type="date"
							value={due}
							onChange={(e) => setDue(e.target.value)}
						/>
					</Field>
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
			</Section>

			{/* Sticky action bar — matches EmployeeForm's full-width fixed footer */}
			<div className="fixed bottom-0 left-0 right-0 border-t border-border-subtle bg-surface/95 backdrop-blur-xl px-6 py-3 flex items-center justify-end gap-3 z-20 shadow-lg">
				<Button asChild variant="ghost" className="rounded-xl">
					<Link to="/admin/assignments">Cancel</Link>
				</Button>
				<Button onClick={submit} disabled={busy} className="soft-glow rounded-xl px-6">
					{recurrence === "none" ? "Publish assignment" : "Schedule recurring assignment"}
				</Button>
			</div>
		</div>
	);
}

function Section({
	eyebrow,
	action,
	children,
}: {
	eyebrow: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="glass-surface rounded-2xl p-5 space-y-3">
			<div className="flex items-center justify-between">
				<p className="layer-eyebrow">{eyebrow}</p>
				{action}
			</div>
			{children}
		</section>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="flex flex-col gap-1.5">
			<span className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</span>
			{children}
		</label>
	);
}
