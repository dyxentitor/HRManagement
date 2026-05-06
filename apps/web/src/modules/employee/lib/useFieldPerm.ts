import { useCan } from "@/lib/perm";

export interface FieldPerm {
	canRead: boolean;
	canWrite: boolean;
}

/**
 * Pair of read/write perm codes; returns whether the current user has each.
 * Pass null (or "") for either side to express "no perm gate" (always allowed).
 */
export function useFieldPerm(
	readPerm: string | null,
	writePerm: string | null,
): FieldPerm {
	const canReadRaw = useCan(readPerm ?? "");
	const canWriteRaw = useCan(writePerm ?? "");
	return {
		canRead: !readPerm ? true : canReadRaw,
		canWrite: !writePerm ? true : canWriteRaw,
	};
}
