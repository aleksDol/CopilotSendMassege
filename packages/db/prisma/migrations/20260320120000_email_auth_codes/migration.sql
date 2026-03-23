-- CreateEnum
CREATE TYPE "EmailAuthCodePurpose" AS ENUM ('LOGIN_2FA', 'REGISTER');

-- CreateTable
CREATE TABLE "EmailAuthCode" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "purpose" "EmailAuthCodePurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "codeSentCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailAuthCode_challengeId_key" ON "EmailAuthCode"("challengeId");

-- CreateIndex
CREATE INDEX "EmailAuthCode_email_purpose_createdAt_idx" ON "EmailAuthCode"("email", "purpose", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EmailAuthCode_challengeId_purpose_usedAt_idx" ON "EmailAuthCode"("challengeId", "purpose", "usedAt");

-- CreateIndex
CREATE INDEX "EmailAuthCode_expiresAt_idx" ON "EmailAuthCode"("expiresAt");
