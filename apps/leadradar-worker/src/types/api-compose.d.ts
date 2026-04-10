declare module "../../api/dist/modules/leadradar/compose.js" {
  import type { PrismaClient } from "@prisma/client";

  export function createLeadRadarIngestionService(params: {
    prisma: PrismaClient;
    logger?: { info: (msg: string) => void };
  }): {
    processMessage: (input: any) => Promise<void>;
  };
}

