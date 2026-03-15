import type { Env } from "./env.js";

export type AppConfig = {
  env: Env;
};

export const createConfig = (env: Env): AppConfig => ({ env });
