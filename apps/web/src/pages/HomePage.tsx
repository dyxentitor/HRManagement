import { useAuth } from "@/lib/auth";

export default function HomePage() {
	const { user, perms } = useAuth();

	return (
		<div className="space-y-3 max-w-3xl">
			<h1 className="text-2xl font-bold">Welcome, {user?.email}</h1>
			<p className="text-text-secondary">Org: {user?.org_id}</p>
			<section>
				<h2 className="font-semibold mt-4 mb-2">Your permissions</h2>
				{perms.size === 0 ? (
					<p className="text-text-secondary">No permissions assigned yet.</p>
				) : (
					<ul className="text-sm font-mono">
						{[...perms].sort().map((p) => (
							<li key={p}>{p}</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
