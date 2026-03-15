import { AppError } from "./errors.js";

export const ensureInternalToken = (headerToken: string | undefined, expectedToken: string) => {
  if (!headerToken || headerToken !== expectedToken) {
    throw new AppError(401, "INTERNAL_UNAUTHORIZED", "Invalid internal token");
  }
};
