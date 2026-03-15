import { apiClient } from "./client";
import type { TeamListResponse, TeamMember } from "./types";

export const teamApi = {
  list: (token: string) => apiClient.get<TeamListResponse>("/team", { token }),
  invite: (token: string, payload: { email: string; role: "member" | "admin" }) =>
    apiClient.post<{ invite: { id: string; email: string; role: string; expiresAt: string; inviteLink: string } }>(
      "/team/invite",
      payload,
      { token }
    ),
  removeMember: (token: string, memberId: string) => apiClient.delete<{ ok: true }>(`/team/member/${memberId}`, { token }),
  acceptInvite: (payload: { token: string; fullName: string; password: string }) =>
    apiClient.post<{ user: TeamMember }>("/team/invite/accept", payload)
};
