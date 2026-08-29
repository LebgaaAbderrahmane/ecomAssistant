-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('CONVERSATION', 'PLATFORM');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "orderSource" "OrderSource" NOT NULL DEFAULT 'PLATFORM';
