import { z } from "zod";

const taskStatusSchema = z.enum(["open", "in_progress", "done", "canceled"]);
const taskTypeSchema = z.enum(["follow_up", "call", "message", "review", "manual"]);
const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

const isoDateSchema = z
  .string()
  .optional()
  .refine((value) => (value ? !Number.isNaN(Date.parse(value)) : true), "Invalid ISO date");

export const listTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  assignedUserId: z.string().uuid().optional(),
  taskType: taskTypeSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueBefore: isoDateSchema,
  dueAfter: isoDateSchema,
  conversationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional()
});

export const createTaskBodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).optional(),
  taskType: taskTypeSchema.default("manual"),
  priority: taskPrioritySchema.default("medium"),
  dueAt: z
    .string()
    .optional()
    .refine((value) => (value ? !Number.isNaN(Date.parse(value)) : true), "Invalid dueAt"),
  assignedUserId: z.string().uuid().optional()
});

export const patchTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    priority: taskPrioritySchema.optional(),
    dueAt: z
      .string()
      .nullable()
      .optional()
      .refine((value) => (value ? !Number.isNaN(Date.parse(value)) : true), "Invalid dueAt"),
    assignedUserId: z.string().uuid().nullable().optional(),
    status: taskStatusSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const taskIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const conversationTaskParamsSchema = z.object({
  id: z.string().uuid()
});
