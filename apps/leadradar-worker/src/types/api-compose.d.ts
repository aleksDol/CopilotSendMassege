declare module "../../api/dist/modules/leadradar/compose.js" {
  import type { PrismaClient } from "@prisma/client";

  export function createLeadRadarIngestionService(params: {
    prisma: PrismaClient;
    logger?: { info: (msg: string) => void; warn?: (msg: string, meta?: Record<string, unknown>) => void };
  }): {
    processMessage: (input: any) => Promise<void>;
  };

  export function createLeadRadarAuthorProfileCheckService(params: {
    prisma: PrismaClient;
    logger?: { info: (msg: string) => void; warn?: (msg: string, meta?: Record<string, unknown>) => void };
    profileFetcher?: {
      fetchProfile: (input: {
        telegramAccountId: string;
        telegramUserId?: string | null;
        username?: string | null;
      }) => Promise<{
        telegramUserId?: string | null;
        username?: string | null;
        displayName?: string | null;
        bio?: string | null;
        linkedChannelId?: string | null;
        linkedChannelUsername?: string | null;
        linkedChannelTitle?: string | null;
        linkedChannelDescription?: string | null;
        rawProfileJson?: unknown | null;
      } | null>;
    };
  }): {
    process: (input: any) => Promise<{
      matched: boolean;
      score: number;
      matchedKeywordsCount: number;
      usedCache: boolean;
      skippedReason?: string;
    }>;
  };
}
