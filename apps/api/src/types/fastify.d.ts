import type { Plan, UserRole } from "@prisma/client";
import type { AppConfig } from "../config/index.js";
import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    prisma: PrismaClient;
    redis: Redis;
    authenticate: import("fastify").preHandlerHookHandler;
    rateLimit: (opts?: unknown) => import("fastify").preHandlerHookHandler;
  }

  interface FastifyRequest {
    rawBody?: Buffer;
    currentUser: {
      id: string;
      email: string;
      fullName: string;
      role: UserRole;
      companyId: string;
      company: {
        id: string;
        name: string;
        slug: string;
        plan: Plan;
        timezone: string;
      };
    } | null;
  }
}
