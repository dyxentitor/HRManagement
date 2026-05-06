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
};
