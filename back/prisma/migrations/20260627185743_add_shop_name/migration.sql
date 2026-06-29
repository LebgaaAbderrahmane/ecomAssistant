/*
  Warnings:

  - Added the required column `shopName` to the `Merchant` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN "shopName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Merchant" ALTER COLUMN "shopName" DROP DEFAULT;
