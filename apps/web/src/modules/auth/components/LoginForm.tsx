import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";

export function LoginForm() {
	const { login, loginWithMFA } = useAuth();
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [mfaState, setMfaState] = useState<{ token: string } | null>(null);
	const [mfaCode, setMfaCode] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			if (mfaState) {
				await loginWithMFA(mfaState.token, mfaCode);
				navigate("/");
				return;
			}
			const result = await login(email, password);
			if (result.mfaRequired && result.mfaToken) {
				setMfaState({ token: result.mfaToken });
			} else {
				navigate("/");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Login failed");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-3 max-w-sm mx-auto">
			<h1 className="text-2xl font-bold mb-2">HRMS — Sign in</h1>
			{!mfaState ? (
				<>
					<input
						type="email"
						placeholder="Email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						aria-label="Email"
						className="w-full border rounded px-3 py-2"
					/>
					<input
						type="password"
						placeholder="Password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						aria-label="Password"
						className="w-full border rounded px-3 py-2"
					/>
				</>
			) : (
				<input
					type="text"
					placeholder="6-digit code"
					value={mfaCode}
					onChange={(e) => setMfaCode(e.target.value)}
					required
					aria-label="MFA code"
					inputMode="numeric"
					// biome-ignore lint/a11y/noAutofocus: MFA step auto-focuses the code field intentionally
					autoFocus
					className="w-full border rounded px-3 py-2"
				/>
			)}
			{error && (
				<p role="alert" className="text-red-600 text-sm">
					{error}
				</p>
			)}
			<button
				type="submit"
				disabled={submitting}
				className="w-full bg-slate-900 text-white py-2 rounded disabled:opacity-50"
			>
				{submitting ? "..." : mfaState ? "Verify" : "Sign in"}
			</button>
		</form>
	);
}
