/*
  Warnings:

  - Made the column `commune` on table `Order` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "commune" TEXT,
ADD COLUMN     "wilaya" TEXT;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "commune" SET NOT NULL,
ALTER COLUMN "address" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Commune" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wilaya" TEXT NOT NULL,
    "wilayaCode" INTEGER NOT NULL,

    CONSTRAINT "Commune_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Commune_wilaya_idx" ON "Commune"("wilaya");

-- CreateIndex
CREATE INDEX "Commune_name_idx" ON "Commune"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Commune_name_wilaya_key" ON "Commune"("name", "wilaya");
