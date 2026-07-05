-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM (new, greeting, order_found, confirmed, cancelled, escalated, closed, expired);

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM (customer, agent);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT ,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_merchantId_phone_key" ON "Customer"("merchantId", "phone");

-- AlterTable - Add customerId to Conversation
ALTER TABLE "Conversation" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "currentOrderId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "state" "ConversationState" NOT NULL DEFAULT new;

-- AlterTable - Add customerId to Order
ALTER TABLE "Order" ADD COLUMN "customerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_currentOrderId_key" ON "Conversation"("currentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_merchantId_customerId_key" ON "Conversation"("merchantId", "customerId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_currentOrderId_fkey" FOREIGN KEY ("currentOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
