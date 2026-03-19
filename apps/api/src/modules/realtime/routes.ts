import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../../lib/errors.js";
import { realtimeHub } from "../../lib/realtime.js";
import { ChannelAccountStatus, ChannelType, TelegramLoginStatus } from "@prisma/client";

const TG_CONNECTED = "CONNECTED" as unknown as TelegramLoginStatus;
const TG_ERROR = "ERROR" as unknown as TelegramLoginStatus;

const HEARTBEAT_MS = 20_000;

const realtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/realtime/events", async (request, reply) => {
    const token = typeof (request.query as { token?: string } | undefined)?.token === "string"
      ? (request.query as { token?: string }).token
      : undefined;

    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    let payload: { sub: string; companyId: string };
    try {
      payload = await app.jwt.verify<{ sub: string; companyId: string }>(token);
    } catch {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const user = await app.prisma.user.findFirst({
      where: {
        id: payload.sub,
        companyId: payload.companyId,
        isActive: true
      },
      select: { id: true, companyId: true }
    });

    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    // Subscribe only to the same "active" telegram identity used by conversations/messages.
    // Otherwise, when multiple telegram accounts exist, realtime events can arrive for the wrong account.
    const activeTelegram = await app.prisma.telegramAccount.findFirst({
      where: {
        loginStatus: { in: [TG_CONNECTED, TG_ERROR] },
        channelAccount: {
          companyId: user.companyId,
          channelType: ChannelType.TELEGRAM,
          createdByUserId: user.id,
          status: { not: ChannelAccountStatus.DISCONNECTED }
        }
      },
      orderBy: { updatedAt: "desc" },
      select: { channelAccountId: true }
    });

    if (!activeTelegram) {
      throw new AppError(400, "TELEGRAM_NOT_CONNECTED", "Telegram account not connected");
    }
    const channelAccountId = activeTelegram.channelAccountId;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const writeEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    writeEvent("ready", { ok: true, ts: Date.now() });

    const unsubscribe = realtimeHub.subscribe(user.companyId, channelAccountId, (event) => {
      writeEvent(event.type, event);
    });

    const heartbeat = setInterval(() => {
      writeEvent("ping", { ts: Date.now() });
    }, HEARTBEAT_MS);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      try {
        reply.raw.end();
      } catch {
        // noop
      }
    });
  });
};

export default realtimeRoutes;
