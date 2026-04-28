import { useEffect, useState } from "react";

import { type InboxItem, getInbox } from "../api";

export default function UnifiedInboxPage() {
	const [items, setItems] = useState<InboxItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setLoading(true);
		getInbox()
			.then(setItems)
			.catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
			.finally(() => setLoading(false));
	}, []);

	if (loading) return <p>Loading…</p>;

	return (
		<div className="space-y-4 max-w-4xl">
			<h1 className="text-2xl font-bold">Approvals</h1>
			{error && (
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}
			{items.length === 0 ? (
				<p className="text-slate-500">No pending approvals.</p>
			) : (
				<ul className="space-y-2">
					{items.map((item) => (
						<li
							key={`${item.kind}-${item.id}`}
							className="bg-white border rounded p-3"
						>
							<div className="flex items-start justify-between">
								<div className="text-sm">
									<span
										className={`inline-block text-xs font-semibold px-2 py-0.5 rounded mr-2 ${
											item.kind === "leave"
												? "bg-blue-100 text-blue-800"
												: "bg-amber-100 text-amber-800"
										}`}
									>
										{item.kind.toUpperCase()}
									</span>
									<span className="font-semibold">{item.employee_code}</span>
									<p className="text-slate-600 mt-1">{item.summary}</p>
									{item.submitted_at && (
										<p className="text-slate-400 text-xs mt-0.5">
											Submitted:{" "}
											{new Date(item.submitted_at).toLocaleDateString()}
										</p>
									)}
								</div>
								<a
									href={item.deep_link}
									className="text-xs text-blue-600 hover:underline ml-4 shrink-0"
								>
									Review
								</a>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
