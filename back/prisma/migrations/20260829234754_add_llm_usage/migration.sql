-- CreateTable
CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "purpose" TEXT,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmUsage_merchantId_createdAt_idx" ON "LlmUsage"("merchantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LlmUsage_conversationId_idx" ON "LlmUsage"("conversationId");

-- CreateIndex
CREATE INDEX "LlmUsage_createdAt_idx" ON "LlmUsage"("createdAt" DESC);
