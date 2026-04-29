import { ChannelAccountStatus, ChannelType, TelegramLoginStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { resolveTelegramAccountForRequest } from "../../lib/telegram-account-resolver.js";
import { TelegramWorkerClient } from "../../lib/telegram-worker-client.js";
import { invalidateConversationCaches } from "../conversations/service.js";

type Scope = {
  companyId: string;
  userId: string;
};

const TG_LOGIN_REQUIRED = "LOGIN_REQUIRED" as unknown as TelegramLoginStatus;
const TG_CONNECTED = "CONNECTED" as unknown as TelegramLoginStatus;
const TG_ERROR = "ERROR" as unknown as TelegramLoginStatus;

const mapTelegramStatus = (status: TelegramLoginStatus): string => status.toLowerCase();

const getWorkerClient = (app: FastifyInstance): TelegramWorkerClient =>
  new TelegramWorkerClient(
    app.config.env.TELEGRAM_WORKER_URL,
    app.config.env.INTERNAL_API_TOKEN,
    app.config.env.TELEGRAM_WORKER_TIMEOUT_MS
  );

const ensureChannelAndAccount = async (app: FastifyInstance, scope: Scope, phone: string) => {
  const result = await app.prisma.$transaction(async (tx) => {
    let channel = await tx.channelAccount.findFirst({
      where: {
        companyId: scope.companyId,
        channelType: ChannelType.TELEGRAM,
        externalAccountId: phone
      },
      include: { telegram: true }
    });

    if (!channel) {
      const hasTelegramChannel = await tx.channelAccount.findFirst({
        where: {
          companyId: scope.companyId,
          channelType: ChannelType.TELEGRAM
        },
        select: { id: true }
      });

      channel = await tx.channelAccount.create({
        data: {
          companyId: scope.companyId,
          channelType: ChannelType.TELEGRAM,
          externalAccountId: phone,
          displayName: `Telegram ${phone}`,
          status: ChannelAccountStatus.CONNECTING,
          isPrimary: !hasTelegramChannel,
          createdByUserId: scope.userId
        },
        include: { telegram: true }
      });
    } else {
      channel = await tx.channelAccount.update({
        where: { id: channel.id },
        data: {
          displayName: `Telegram ${phone}`,
          status: ChannelAccountStatus.CONNECTING
        },
        include: { telegram: true }
      });
    }

    await tx.telegramAccount.upsert({
      where: { channelAccountId: channel.id },
      update: {
        phone,
        loginStatus: TG_LOGIN_REQUIRED,
        errorMessage: null
      },
      create: {
        channelAccountId: channel.id,
        phone,
        loginStatus: TG_LOGIN_REQUIRED
      }
    });

    return channel;
  });

  return result;
};

const QR_EXTERNAL_ID = "telegram-qr";

const toQrSessionKey = (qrSessionId: string) => `tg:qr-session:${qrSessionId}`;

const normalizeExpiresAtMs = (expiresAt: number): number => {
  // Worker may return seconds or milliseconds since epoch; handle both safely.
  return expiresAt < 1_000_000_000_000 ? expiresAt * 1000 : expiresAt;
};

const bindQrSessionToScope = async (
  app: FastifyInstance,
  params: {
    qrSessionId: string;
    scope: Scope;
    channelAccountId: string;
    expiresAt: number;
  }
) => {
  const expiresAtMs = normalizeExpiresAtMs(params.expiresAt);
  const ttlSeconds = Math.max(30, Math.floor((expiresAtMs - Date.now()) / 1000));

  const payload = JSON.stringify({
    companyId: params.scope.companyId,
    userId: params.scope.userId,
    channelAccountId: params.channelAccountId,
    expiresAtMs
  });

  try {
    await app.redis.set(toQrSessionKey(params.qrSessionId), payload, "EX", ttlSeconds);
  } catch (error) {
    app.log.warn({ err: error }, "Failed to bind Telegram QR session to scope");
    throw new AppError(503, "TELEGRAM_QR_UNAVAILABLE", "Temporary error. Please retry.");
  }
};

const requireQrSessionOwnership = async (app: FastifyInstance, scope: Scope, qrSessionId: string) => {
  let raw: string | null = null;
  try {
    raw = await app.redis.get(toQrSessionKey(qrSessionId));
  } catch (error) {
    app.log.warn({ err: error }, "Failed to read Telegram QR session binding");
    throw new AppError(503, "TELEGRAM_QR_UNAVAILABLE", "Temporary error. Please retry.");
  }

  if (!raw) {
    throw new AppError(404, "TELEGRAM_QR_NOT_FOUND", "QR session not found or expired");
  }

  let parsed: { companyId: string; userId: string; channelAccountId?: string } | null = null;
  try {
    parsed = JSON.parse(raw) as { companyId: string; userId: string; channelAccountId?: string };
  } catch {
    throw new AppError(404, "TELEGRAM_QR_NOT_FOUND", "QR session not found or expired");
  }

  if (parsed.companyId !== scope.companyId || parsed.userId !== scope.userId) {
    // Don't leak that a session exists for another tenant/user.
    throw new AppError(404, "TELEGRAM_QR_NOT_FOUND", "QR session not found or expired");
  }

  return parsed;
};

const ensureChannelAndAccountForQr = async (app: FastifyInstance, scope: Scope) => {
  const result = await app.prisma.$transaction(async (tx) => {
    // QR placeholder channel: worker will route to the real telegram identity.
    let channel = await tx.channelAccount.findFirst({
      where: {
        companyId: scope.companyId,
        channelType: ChannelType.TELEGRAM,
        externalAccountId: QR_EXTERNAL_ID
      },
      include: { telegram: true }
    });

    if (!channel) {
      channel = await tx.channelAccount.create({
        data: {
          companyId: scope.companyId,
          channelType: ChannelType.TELEGRAM,
          externalAccountId: QR_EXTERNAL_ID,
          displayName: "Telegram",
          status: ChannelAccountStatus.CONNECTING,
          isPrimary: true,
          createdByUserId: scope.userId
        },
        include: { telegram: true }
      });
    } else {
      channel = await tx.channelAccount.update({
        where: { id: channel.id },
        data: { status: ChannelAccountStatus.CONNECTING },
        include: { telegram: true }
      });
    }
    await tx.telegramAccount.upsert({
      where: { channelAccountId: channel.id },
      update: { loginStatus: TG_LOGIN_REQUIRED, errorMessage: null },
      create: {
        channelAccountId: channel.id,
        loginStatus: TG_LOGIN_REQUIRED
      },
    });

    return channel;
  });

  return result;
};

export const startConnectQr = async (app: FastifyInstance, scope: Scope) => {
  const channel = await ensureChannelAndAccountForQr(app, scope);
  const worker = getWorkerClient(app);
  const response = (await worker.startLoginQr({
    companyId: scope.companyId,
    channelAccountId: channel.id
  })) as unknown as { qrSessionId: string; qrUrl: string; expiresAt: number };

  await bindQrSessionToScope(app, {
    qrSessionId: response.qrSessionId,
    scope,
    channelAccountId: channel.id,
    expiresAt: response.expiresAt
  });

  return response;
};

export const pollLoginQr = async (
  app: FastifyInstance,
  scope: Scope,
  payload: { qrSessionId: string }
) => {
  await requireQrSessionOwnership(app, scope, payload.qrSessionId);
  const worker = getWorkerClient(app);
  return (await worker.pollLoginQr({ qrSessionId: payload.qrSessionId })) as {
    status: string;
    expiresAt: number;
    errorMessage?: string | null;
  };
};

export const verifyPasswordQr = async (
  app: FastifyInstance,
  scope: Scope,
  payload: { qrSessionId: string; password: string }
) => {
  await requireQrSessionOwnership(app, scope, payload.qrSessionId);
  const worker = getWorkerClient(app);
  return worker.verifyPasswordQr({ qrSessionId: payload.qrSessionId, password: payload.password });
};

export const startConnect = async (app: FastifyInstance, scope: Scope, payload: { phone: string }) => {
  const channel = await ensureChannelAndAccount(app, scope, payload.phone);

  const worker = getWorkerClient(app);
  const response = await worker.startLogin({
    companyId: scope.companyId,
    channelAccountId: channel.id,
    phone: payload.phone
  });

  return {
    status: response.status,
    requiresPassword: response.requiresPassword ?? false
  };
};

export const verifyCode = async (
  app: FastifyInstance,
  scope: Scope,
  payload: { phone: string; code: string }
) => {
  const worker = getWorkerClient(app);

  return worker.verifyCode({
    companyId: scope.companyId,
    phone: payload.phone,
    code: payload.code
  });
};

export const verifyPassword = async (
  app: FastifyInstance,
  scope: Scope,
  payload: { phone: string; password: string }
) => {
  const worker = getWorkerClient(app);

  return worker.verifyPassword({
    companyId: scope.companyId,
    phone: payload.phone,
    password: payload.password
  });
};

export const getTelegramAccount = async (
  app: FastifyInstance,
  scope: Scope,
  query?: { channelAccountId?: string }
) => {
  const resolved = await resolveTelegramAccountForRequest(app.prisma, {
    companyId: scope.companyId,
    userId: scope.userId,
    channelAccountId: query?.channelAccountId
  });

  const account = resolved
    ? await app.prisma.telegramAccount.findUnique({
        where: { id: resolved.telegramAccountId },
        include: { channelAccount: true }
      })
    : null;

  if (!account) {
    return {
      status: "not_connected"
    };
  }

  return {
    telegramAccountId: account.id,
    channelStatus: account.channelAccount.status.toLowerCase(),
    channelAccountId: account.channelAccountId,
    phone: account.phone,
    loginStatus: mapTelegramStatus(account.loginStatus),
    displayName: account.channelAccount.displayName,
    isPrimary: account.channelAccount.isPrimary,
    sendingEnabled: account.channelAccount.sendingEnabled,
    parsingEnabled: account.channelAccount.parsingEnabled,
    username: account.username,
    lastSyncAt: account.lastSyncAt,
    errorMessage: account.errorMessage
  };
};

export const listTelegramAccounts = async (app: FastifyInstance, scope: Scope) => {
  const rows = await app.prisma.telegramAccount.findMany({
    where: {
      channelAccount: {
        companyId: scope.companyId,
        channelType: ChannelType.TELEGRAM,
        createdByUserId: scope.userId
      }
    },
    include: { channelAccount: true },
    orderBy: [{ updatedAt: "desc" }]
  });

  return {
    items: rows.map((account) => ({
      telegramAccountId: account.id,
      channelStatus: account.channelAccount.status.toLowerCase(),
      channelAccountId: account.channelAccountId,
      phone: account.phone,
      loginStatus: mapTelegramStatus(account.loginStatus),
      displayName: account.channelAccount.displayName,
      isPrimary: account.channelAccount.isPrimary,
      sendingEnabled: account.channelAccount.sendingEnabled,
      parsingEnabled: account.channelAccount.parsingEnabled,
      username: account.username,
      lastSyncAt: account.lastSyncAt,
      errorMessage: account.errorMessage
    }))
  };
};

export const patchTelegramAccountFlags = async (
  app: FastifyInstance,
  scope: Scope,
  payload: {
    channelAccountId: string;
    sendingEnabled?: boolean;
    parsingEnabled?: boolean;
  }
) => {
  const account = await app.prisma.channelAccount.findFirst({
    where: {
      id: payload.channelAccountId,
      companyId: scope.companyId,
      channelType: ChannelType.TELEGRAM
    },
    include: { telegram: true }
  });

  if (!account?.telegram) {
    throw new AppError(404, "TELEGRAM_ACCOUNT_NOT_FOUND", "Telegram account not found");
  }

  const nextSending = payload.sendingEnabled ?? account.sendingEnabled;
  const nextParsing = payload.parsingEnabled ?? account.parsingEnabled;
  if (!nextSending && !nextParsing) {
    throw new AppError(400, "INVALID_TELEGRAM_ACCOUNT_FLAGS", "Cannot disable both flags");
  }

  const updated = await app.prisma.channelAccount.update({
    where: { id: account.id },
    data: {
      ...(payload.sendingEnabled !== undefined ? { sendingEnabled: payload.sendingEnabled } : {}),
      ...(payload.parsingEnabled !== undefined ? { parsingEnabled: payload.parsingEnabled } : {})
    }
  });

  return {
    channelAccountId: updated.id,
    sendingEnabled: updated.sendingEnabled,
    parsingEnabled: updated.parsingEnabled
  };
};

export const triggerInitialSync = async (
  app: FastifyInstance,
  scope: Scope,
  payload?: {
    phone?: string;
    channelAccountId?: string;
    dialogsLimit?: number;
    messagesPerDialog?: number;
  }
) => {
  const requestedChannelAccountId = payload?.channelAccountId?.trim() ?? "";
  let connectedAccount;

  if (requestedChannelAccountId) {
    const resolved = await resolveTelegramAccountForRequest(app.prisma, {
      companyId: scope.companyId,
      userId: scope.userId,
      channelAccountId: requestedChannelAccountId
    });

    connectedAccount = await app.prisma.telegramAccount.findFirst({
      where: {
        id: resolved?.telegramAccountId,
        phone: payload?.phone,
        loginStatus: { in: [TG_CONNECTED, TG_ERROR] },
        channelAccount: {
          companyId: scope.companyId,
          channelType: ChannelType.TELEGRAM,
          createdByUserId: scope.userId
        }
      },
      include: {
        channelAccount: true
      }
    });
  } else {
    const totalAccounts = await app.prisma.telegramAccount.count({
      where: {
        channelAccount: {
          companyId: scope.companyId,
          channelType: ChannelType.TELEGRAM,
          createdByUserId: scope.userId
        }
      }
    });
    if (totalAccounts > 1) {
      app.log.warn(
        "triggerInitialSync called without channelAccountId in multi-account environment"
      );
    }

    connectedAccount = await app.prisma.telegramAccount.findFirst({
      where: {
        phone: payload?.phone,
        loginStatus: { in: [TG_CONNECTED, TG_ERROR] },
        channelAccount: {
          companyId: scope.companyId,
          channelType: ChannelType.TELEGRAM,
          createdByUserId: scope.userId
        }
      },
      include: {
        channelAccount: true
      }
    });
  }

  if (!connectedAccount) {
    throw new AppError(400, "TELEGRAM_NOT_CONNECTED", "Connected Telegram account not found for workspace");
  }

  const worker = getWorkerClient(app);

  return worker.sync({
    companyId: scope.companyId,
    channelAccountId: connectedAccount.channelAccountId,
    phone: connectedAccount.phone,
    dialogsLimit: payload?.dialogsLimit,
    messagesPerDialog: payload?.messagesPerDialog
  });
};

export const disconnectTelegram = async (app: FastifyInstance, scope: Scope) => {
  const channelAccounts = await app.prisma.channelAccount.findMany({
    where: { companyId: scope.companyId, channelType: ChannelType.TELEGRAM, createdByUserId: scope.userId },
    select: { id: true }
  });

  if (!channelAccounts.length) {
    return { status: "not_connected" };
  }

  const worker = getWorkerClient(app);

  for (const account of channelAccounts) {
    // Best-effort remote logout + session cleanup inside worker
    try {
      await worker.logout({ companyId: scope.companyId, channelAccountId: account.id });
    } catch {
      // Continue with DB cleanup even if worker is unavailable
    }

    await app.prisma.$transaction(async (tx) => {
      // Keep chats/messages/AI suggestions. Only clear auth/session and mark disconnected.
      await tx.telegramAccount.updateMany({
        where: { channelAccountId: account.id },
        data: {
          sessionDataEncrypted: null,
          telegramUserId: null,
          username: null,
          apiDcId: null,
          authPhoneCodeHash: null,
          loginStatus: TG_LOGIN_REQUIRED,
          errorMessage: null
        }
      });

      await tx.channelAccount.update({
        where: { id: account.id },
        data: { status: ChannelAccountStatus.DISCONNECTED }
      });
    });
  }

  await invalidateConversationCaches(app, scope.companyId);

  return { status: "disconnected" };
};
