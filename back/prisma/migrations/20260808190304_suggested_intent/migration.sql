-- AlterTable
ALTER TABLE "AgentConfig" ADD COLUMN     "escalationThreshold" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "templates" JSONB;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "passwordHash" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "agentEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ShopifyConnection" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'DZD',
ADD COLUMN     "defaultOrderStatus" TEXT NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "DeliveryProviderConfig" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiId" TEXT,
    "apiToken" TEXT,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestedIntent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestedIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryProviderConfig_merchantId_key" ON "DeliveryProviderConfig"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestedIntent_name_key" ON "SuggestedIntent"("name");

-- CreateIndex
CREATE INDEX "SuggestedIntent_count_idx" ON "SuggestedIntent"("count" DESC);

-- AddForeignKey
ALTER TABLE "DeliveryProviderConfig" ADD CONSTRAINT "DeliveryProviderConfig_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
