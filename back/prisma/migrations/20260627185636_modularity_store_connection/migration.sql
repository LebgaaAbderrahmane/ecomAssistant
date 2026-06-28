/*
  Warnings:

  - You are about to drop the column `accessToken` on the `StoreConnection` table. All the data in the column will be lost.
  - You are about to drop the column `platform` on the `StoreConnection` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `StoreConnection` table. All the data in the column will be lost.
  - You are about to drop the column `refreshTokenExpiresAt` on the `StoreConnection` table. All the data in the column will be lost.
  - You are about to drop the column `scopes` on the `StoreConnection` table. All the data in the column will be lost.
  - You are about to drop the column `shopifyDomain` on the `StoreConnection` table. All the data in the column will be lost.
  - You are about to drop the column `tokenExpiresAt` on the `StoreConnection` table. All the data in the column will be lost.
  - You are about to drop the `Shop` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `followUpDelays` on the `AgentConfig` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `images` on the `Product` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `source` to the `StoreConnection` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Source" AS ENUM ('SHOPIFY', 'WOOCOMMERCE');

-- DropForeignKey
ALTER TABLE "Shop" DROP CONSTRAINT "Shop_merchantId_fkey";

-- DropIndex
DROP INDEX "StoreConnection_merchantId_key";

-- AlterTable
ALTER TABLE "AgentConfig" DROP COLUMN "followUpDelays",
ADD COLUMN     "followUpDelays" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "images",
ADD COLUMN     "images" JSONB NOT NULL,
ALTER COLUMN "variants" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StoreConnection" DROP COLUMN "accessToken",
DROP COLUMN "platform",
DROP COLUMN "refreshToken",
DROP COLUMN "refreshTokenExpiresAt",
DROP COLUMN "scopes",
DROP COLUMN "shopifyDomain",
DROP COLUMN "tokenExpiresAt",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "source" "Source" NOT NULL;

-- DropTable
DROP TABLE "Shop";

-- DropEnum
DROP TYPE "Platform";

-- CreateTable
CREATE TABLE "ShopifyConnection" (
    "id" TEXT NOT NULL,
    "storeConnectionId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyConnection_storeConnectionId_key" ON "ShopifyConnection"("storeConnectionId");

-- CreateIndex
CREATE INDEX "ShopifyConnection_shopDomain_idx" ON "ShopifyConnection"("shopDomain");

-- AddForeignKey
ALTER TABLE "ShopifyConnection" ADD CONSTRAINT "ShopifyConnection_storeConnectionId_fkey" FOREIGN KEY ("storeConnectionId") REFERENCES "StoreConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
