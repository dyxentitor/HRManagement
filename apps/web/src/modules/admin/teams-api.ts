import { api } from "@/lib/api";

export interface Team {
	id: string;
	name: string;
	parent_team?: string | null;
	sort_order?: number;
	min_headcount?: number | null;
}

export interface TeamWritePayload {
	name: string;
	parent_team?: string | null;
	sort_order?: number;
	min_headcount?: number | null;
}

export const teamApi = {
	list: async (): Promise<Team[]> => {
		const { data, error } = await api.GET("/api/v1/teams/");
		if (error) throw new Error("Could not load teams");
		return ((data ?? []) as unknown as Team[]) ?? [];
	},
	create: async (payload: TeamWritePayload): Promise<Team> => {
		const { data, error } = await api.POST("/api/v1/teams/", {
			body: payload,
		});
		if (error) throw error;
		return data as unknown as Team;
	},
	update: async (
		id: string,
		payload: Partial<TeamWritePayload>,
	): Promise<Team> => {
		const { data, error } = await api.PATCH("/api/v1/teams/{id}/", {
			params: { path: { id } },
			body: payload,
		});
		if (error) throw error;
		return data as unknown as Team;
	},
	archive: async (id: string): Promise<void> => {
		const { error } = await api.DELETE("/api/v1/teams/{id}/", {
			params: { path: { id } },
		});
		if (error) throw error;
	},
};
