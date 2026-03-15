import { z } from "zod";

export const inviteMemberBodySchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["member", "admin"]).default("member")
});

export const removeMemberParamsSchema = z.object({
  id: z.string().uuid()
});

export const acceptInviteBodySchema = z.object({
  token: z.string().min(10),
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(128)
});
