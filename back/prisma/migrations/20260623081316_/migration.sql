/*
  Warnings:

  - You are about to drop the column `isConnected` on the `StoreConnection` table. All the data in the column will be lost.
  - You are about to drop the column `lastSyncAt` on the `StoreConnection` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `StoreConnection` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `platform` on the `StoreConnection` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('SHOPIFY', 'WOOCOMMERCE');

-- AlterTable
ALTER TABLE "StoreConnection" DROP COLUMN "isConnected",
DROP COLUMN "lastSyncAt",
ADD COLUMN     "scopes" TEXT,
ADD COLUMN     "shopifyDomain" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "platform",
ADD COLUMN     "platform" "Platform" NOT NULL;
