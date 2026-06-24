import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { type Question, type QuestionnairePayload, assignmentsApi } from "../api";

export default function QuestionnairePage() {
	const { id = "" } = useParams();
	const navigate = useNavigate();
	const [data, setData] = useState<QuestionnairePayload | null>(null);
	const [answers, setAnswers] = useState<Record<string, unknown>>({});
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		try {
			setData(await assignmentsApi.questionnaire(id));
		} catch {
			setData(null);
		}
	}, [id]);

	useEffect(() => {
		void load();
	}, [load]);

	function setAnswer(qid: string, value: unknown) {
		setAnswers((a) => ({ ...a, [qid]: value }));
	}

	async function submit() {
		const missing = (data?.questions ?? []).find(
			(q) =>
				q.required &&
				(answers[q.id] == null ||
					answers[q.id] === "" ||
					(Array.isArray(answers[q.id]) && (answers[q.id] as unknown[]).length === 0)),
		);
		if (missing) {
			toast.error(`"${missing.text}" is required.`);
			return;
		}
		setBusy(true);
		try {
			await assignmentsApi.submit(id, answers);
			toast.success("Submitted — thank you");
			navigate("/action-center");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not submit");
		} finally {
			setBusy(false);
		}
	}

	if (data === null) return <Skeleton className="h-64 rounded-2xl" />;

	return (
		<div className="space-y-5 max-w-2xl">
			<PageHeader
				breadcrumb="Action Center"
				title={data.assignment.title}
				subtitle={data.assignment.description || undefined}
			/>
			{data.completed ? (
				<p className="glass-surface rounded-2xl p-8 text-center text-small text-mint">
					You've already completed this questionnaire. ✓
				</p>
			) : (
				<>
					{data.questions.map((q, i) => (
						<section key={q.id} className="glass-surface rounded-2xl p-4 space-y-3">
							<p className="text-body text-text-primary">
								<span className="text-text-tertiary mr-1.5">{i + 1}.</span>
								{q.text}
								{q.required && <span className="text-coral"> *</span>}
							</p>
							<QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
						</section>
					))}
					<Button onClick={submit} disabled={busy} className="soft-glow rounded-xl">
						Submit
					</Button>
				</>
			)}
		</div>
	);
}

function QuestionInput({
	q,
	value,
	onChange,
}: {
	q: Question;
	value: unknown;
	onChange: (v: unknown) => void;
}) {
	if (q.qtype === "short_text") {
		return (
			<Input
				aria-label={q.text}
				value={(value as string) ?? ""}
				onChange={(e) => onChange(e.target.value)}
			/>
		);
	}
	if (q.qtype === "rating") {
		return (
			<div className="flex gap-2">
				{[1, 2, 3, 4, 5].map((n) => (
					<button
						key={n}
						type="button"
						aria-label={`Rate ${n}`}
						onClick={() => onChange(n)}
						className={cn(
							"size-9 rounded-lg border tabular-nums",
							value === n
								? "bg-accent-500 text-white border-accent-500"
								: "border-border-subtle text-text-secondary hover:border-border-strong",
						)}
					>
						{n}
					</button>
				))}
			</div>
		);
	}
	const selected = Array.isArray(value)
		? (value as string[])
		: value != null
			? [value as string]
			: [];
	const toggle = (opt: string) => {
		if (q.qtype === "single_choice") return onChange(opt);
		onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);
	};
	return (
		<div className="space-y-1.5">
			{q.options.map((opt) => (
				<button
					key={opt}
					type="button"
					onClick={() => toggle(opt)}
					className={cn(
						"w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-small",
						selected.includes(opt)
							? "bg-accent-500/15 border-accent-500/50 text-text-primary"
							: "border-border-subtle text-text-secondary hover:bg-surface-elevated/40",
					)}
				>
					<span
						className={cn(
							"size-4 grid place-items-center shrink-0 border",
							q.qtype === "single_choice" ? "rounded-full" : "rounded",
							selected.includes(opt) ? "bg-accent-500 border-accent-500" : "border-border-strong",
						)}
					>
						{selected.includes(opt) && <span className="size-1.5 rounded-full bg-white" />}
					</span>
					{opt}
				</button>
			))}
		</div>
	);
}
