import type { FastifyPluginAsync } from "fastify";
import { getCurrentUserOrThrow } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import {
  loginBodySchema,
  loginRequestCodeBodySchema,
  loginVerifyCodeBodySchema,
  registerBodySchema,
  registerRequestCodeBodySchema,
  registerVerifyCodeBodySchema,
  resendCodeBodySchema
} from "./schemas.js";
import {
  getMe,
  loginRequestCode,
  loginUser,
  loginVerifyCode,
  registerRequestCode,
  registerUser,
  registerVerifyCode,
  resendLoginCode,
  resendRegisterCode
} from "./service.js";

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/register", async (request) => {
    const body = parseWithSchema(registerBodySchema, request.body);

    return registerUser(app, body);
  });

  app.post("/auth/login", async (request) => {
    const body = parseWithSchema(loginBodySchema, request.body);

    return loginUser(app, body);
  });

  app.post("/auth/login/request-code", async (request) => {
    const body = parseWithSchema(loginRequestCodeBodySchema, request.body);
    return loginRequestCode(app, body, { ipAddress: request.ip, userAgent: request.headers["user-agent"] });
  });

  app.post("/auth/login/verify-code", async (request) => {
    const body = parseWithSchema(loginVerifyCodeBodySchema, request.body);
    return loginVerifyCode(app, body, { ipAddress: request.ip });
  });

  app.post("/auth/login/resend-code", async (request) => {
    const body = parseWithSchema(resendCodeBodySchema, request.body);
    return resendLoginCode(app, body, { ipAddress: request.ip, userAgent: request.headers["user-agent"] });
  });

  app.post("/auth/register/request-code", async (request) => {
    const body = parseWithSchema(registerRequestCodeBodySchema, request.body);
    return registerRequestCode(app, body, { ipAddress: request.ip, userAgent: request.headers["user-agent"] });
  });

  app.post("/auth/register/verify-code", async (request) => {
    const body = parseWithSchema(registerVerifyCodeBodySchema, request.body);
    return registerVerifyCode(app, body, { ipAddress: request.ip });
  });

  app.post("/auth/register/resend-code", async (request) => {
    const body = parseWithSchema(resendCodeBodySchema, request.body);
    return resendRegisterCode(app, body, { ipAddress: request.ip, userAgent: request.headers["user-agent"] });
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    const currentUser = getCurrentUserOrThrow(request);
    return getMe(app, currentUser.id);
  });
};

export default authRoutes;
