import { api } from "@/lib/api";

export type AnnouncementCategory =
	| "policy"
	| "event"
	| "maintenance"
	| "holiday"
	| "general";

export interface Announcement {
	id: string;
	title: string;
	body: string;
	category: AnnouncementCategory;
	pinned: boolean;
	published_at: string;
	expires_at: string | null;
	created_at: string;
}

export interface AnnouncementWritePayload {
	title: string;
	body: string;
	category: AnnouncementCategory;
	pinned: boolean;
	expires_at?: string | null;
}

/** Extract an RFC 7807 errors[0].message (v1.10.1 pattern), else a fallback. */
function errorMessage(error: unknown, fallback: string): string {
	if (!error || typeof error !== "object") return fallback;
	const e = error as Record<string, unknown>;
	const errs = e.errors;
	if (Array.isArray(errs) && errs.length > 0) {
		const first = errs[0] as Record<string, unknown>;
		if (typeof first.message === "string" && first.message) return first.message;
	}
	if (typeof e.detail === "string" && e.detail) return e.detail;
	if (typeof e.title === "string" && e.title) return e.title;
	return fallback;
}

export const announcementApi = {
	list: async (): Promise<Announcement[]> => {
		const { data, error } = await api.GET("/api/v1/announcements/");
		if (error) throw new Error(errorMessage(error, "Could not load announcements"));
		return ((data ?? []) as unknown as Announcement[]) ?? [];
	},

	create: async (payload: AnnouncementWritePayload): Promise<Announcement> => {
		const { data, error } = await api.POST("/api/v1/announcements/", {
			// biome-ignore lint/suspicious/noExplicitAny: generated body type is narrower than our payload
			body: payload as any,
		});
		if (error) throw new Error(errorMessage(error, "Could not create announcement"));
		return data as unknown as Announcement;
	},

	update: async (
		id: string,
		payload: Partial<AnnouncementWritePayload>,
	): Promise<Announcement> => {
		const { data, error } = await api.PATCH("/api/v1/announcements/{id}/", {
			params: { path: { id } },
			// biome-ignore lint/suspicious/noExplicitAny: generated body type is narrower than our payload
			body: payload as any,
		});
		if (error) throw new Error(errorMessage(error, "Could not update announcement"));
		return data as unknown as Announcement;
	},

	remove: async (id: string): Promise<void> => {
		const { error } = await api.DELETE("/api/v1/announcements/{id}/", {
			params: { path: { id } },
		});
		if (error) throw new Error(errorMessage(error, "Could not delete announcement"));
	},
};
