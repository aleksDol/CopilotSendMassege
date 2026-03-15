import type { ZodType } from "zod";
import { ZodError } from "zod";
import { AppError } from "./errors.js";

export const parseWithSchema = <T>(schema: ZodType<T>, payload: unknown): T => {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid request payload", error.flatten());
    }

    throw error;
  }
};
