import { z } from "zod";
import { LeadStage } from "@prisma/client";

export const listCrmLeadsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  stage: z.nativeEnum(LeadStage).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  channelAccountId: z.string().uuid().optional()
});
