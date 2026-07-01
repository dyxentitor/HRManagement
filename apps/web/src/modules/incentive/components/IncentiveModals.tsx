import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

import { type OverviewPool, incentiveApi } from "../api";

const field =
	"w-full bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body focus:outline-none focus:border-accent-500/50";

interface DialogBase {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	onDone: () => void;
}

export function NewCustomerModal({ open, onOpenChange, onDone }: DialogBase) {
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	async function save() {
		if (!name.trim()) return;
		setBusy(true);
		try {
			await incentiveApi.customers.create({ name: name.trim() });
			toast.success("Customer added.");
			setName("");
			onDone();
			onOpenChange(false);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New customer</DialogTitle>
				</DialogHeader>
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Customer name"
					aria-label="Customer name"
					className={field}
				/>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
						Cancel
					</Button>
					<Button onClick={save} disabled={busy} className="bg-accent-500 text-white">
						Add customer
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function TopUpModal({
	open,
	onOpenChange,
	onDone,
	pools,
}: DialogBase & { pools: OverviewPool[] }) {
	const [customer, setCustomer] = useState(pools[0]?.id ?? "");
	const [mandays, setMandays] = useState("");
	const [busy, setBusy] = useState(false);
	async function save() {
		if (!customer || !mandays) return;
		setBusy(true);
		try {
			await incentiveApi.customers.topUp(customer, mandays);
			toast.success(`Added ${mandays} mandays.`);
			setMandays("");
			onDone();
			onOpenChange(false);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Top-up failed.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Top up a pool</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<select
						value={customer}
						onChange={(e) => setCustomer(e.target.value)}
						aria-label="Customer"
						className={field}
					>
						{pools.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name} · {p.remaining} md left
							</option>
						))}
					</select>
					<input
						type="number"
						min="0"
						step="0.25"
						value={mandays}
						onChange={(e) => setMandays(e.target.value)}
						placeholder="Mandays to add"
						aria-label="Mandays"
						className={field}
					/>
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
						Cancel
					</Button>
					<Button onClick={save} disabled={busy} className="bg-accent-500 text-white">
						Top up
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function NewProjectModal({
	open,
	onOpenChange,
	onDone,
	pools,
}: DialogBase & { pools: OverviewPool[] }) {
	const [customer, setCustomer] = useState(pools[0]?.id ?? "");
	const [name, setName] = useState("");
	const [budget, setBudget] = useState("");
	const [deadline, setDeadline] = useState("");
	const [includeSoc, setIncludeSoc] = useState(false);
	const [busy, setBusy] = useState(false);

	async function save() {
		if (!customer || !name.trim() || !budget) {
			toast.error("Customer, name and budget are required.");
			return;
		}
		setBusy(true);
		try {
			await incentiveApi.projects.create({
				customer,
				name: name.trim(),
				budget_mandays: budget,
				include_soc: includeSoc,
				deadline: deadline || null,
			});
			toast.success("Project opened.");
			setName("");
			setBudget("");
			setDeadline("");
			setIncludeSoc(false);
			onDone();
			onOpenChange(false);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not open project.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New project</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<select
						value={customer}
						onChange={(e) => setCustomer(e.target.value)}
						aria-label="Customer"
						className={field}
					>
						{pools.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Project name"
						aria-label="Project name"
						className={field}
					/>
					<div className="grid grid-cols-2 gap-3">
						<label className="block">
							<span className="text-small text-text-tertiary">Budget (mandays)</span>
							<input
								type="number"
								min="0"
								step="0.25"
								value={budget}
								onChange={(e) => setBudget(e.target.value)}
								aria-label="Budget mandays"
								className={field}
							/>
						</label>
						<label className="block">
							<span className="text-small text-text-tertiary">Deadline (optional)</span>
							<input
								type="date"
								value={deadline}
								onChange={(e) => setDeadline(e.target.value)}
								aria-label="Deadline"
								className={field}
							/>
						</label>
					</div>
					<label className="flex items-center gap-2 text-small text-text-secondary">
						<input
							type="checkbox"
							checked={includeSoc}
							onChange={(e) => setIncludeSoc(e.target.checked)}
						/>
						Visible to the SOC team
					</label>
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
						Cancel
					</Button>
					<Button onClick={save} disabled={busy} className="bg-accent-500 text-white">
						Open project
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
