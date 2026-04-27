import { useAuth } from "./auth";

export function useCan(perm: string | string[]): boolean {
	const { perms } = useAuth();
	const required = Array.isArray(perm) ? perm : [perm];
	return required.every((p) => perms.has(p));
}
