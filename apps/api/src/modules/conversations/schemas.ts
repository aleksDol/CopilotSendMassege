import { z } from "zod";

export const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  status: z.enum(["active", "archived", "all"]).optional(),
  assignedUserId: z.string().uuid().optional(),
  waitingForReply: z.coerce.boolean().optional(),
  leadStage: z.string().optional()
});
