import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../lib/errors.js";

const authPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest("currentUser", null);

  await app.register(fastifyJwt, {
    secret: app.config.env.JWT_SECRET
  });

  app.decorate("authenticate", async (request) => {
    try {
      const payload = await request.jwtVerify<{ sub: string; companyId: string }>();

      const user = await app.prisma.user.findFirst({
        where: {
          id: payload.sub,
          companyId: payload.companyId,
          isActive: true
        },
        include: {
          company: true
        }
      });

      if (!user) {
        throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      }

      request.currentUser = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyId: user.companyId,
        company: {
          id: user.company.id,
          name: user.company.name,
          slug: user.company.slug,
          plan: user.company.plan,
          timezone: user.company.timezone
        }
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
  });
};

export default fp(authPlugin, { name: "auth", dependencies: ["prisma"] });
