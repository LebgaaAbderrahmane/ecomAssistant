-- CreateEnum
CREATE TYPE "Source" AS ENUM ('SHOPIFY', 'WOOCOMMERCE');

-- CreateEnum
CREATE TYPE "ConversationOwner" AS ENUM ('AI', 'MERCHANT');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('CUSTOMER', 'AI', 'MERCHANT');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('IDLE', 'GREETING', 'PRODUCT_DISCOVERY', 'PRODUCT_SELECTED', 'WAITING_CONFIRMATION', 'CONFIRMED', 'SHIPPING', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationTokenHash" TEXT,
    "verificationTokenExpiresAt" TIMESTAMP(3),

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConnection" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "source" "Source" NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConnection_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'auto',
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "followUpDelays" JSONB NOT NULL,
    "maxFollowUps" INTEGER NOT NULL DEFAULT 3,
    "deliveryProvider" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "platformProductId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "images" JSONB NOT NULL,
    "variants" JSONB NOT NULL,
    "stockStatus" TEXT NOT NULL DEFAULT 'in_stock',
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "platformOrderId" TEXT NOT NULL,
    "wilaya" TEXT NOT NULL,
    "commune" TEXT,
    "address" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "deliveryCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "trackingNumber" TEXT,
    "deliveryProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currentOrderId" TEXT,
    "owner" "ConversationOwner" NOT NULL DEFAULT 'AI',
    "state" "ConversationState" NOT NULL DEFAULT 'IDLE',
    "language" TEXT NOT NULL DEFAULT 'auto',
    "memory" JSONB,
    "followUpStep" INTEGER NOT NULL DEFAULT 0,
    "takenOverByHuman" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "mediaUrl" TEXT,
    "mimeType" TEXT,
    "whatsappMessageId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "text" TEXT NOT NULL,
    "rawPayload" JSONB,
    "intent" TEXT,
    "entities" JSONB,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WilayaDeliveryCost" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "wilaya" TEXT NOT NULL,
    "wilayaCode" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WilayaDeliveryCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppSession" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- CreateIndex
CREATE INDEX "StoreConnection_merchantId_idx" ON "StoreConnection"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyConnection_storeConnectionId_key" ON "ShopifyConnection"("storeConnectionId");

-- CreateIndex
CREATE INDEX "ShopifyConnection_shopDomain_idx" ON "ShopifyConnection"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_merchantId_key" ON "AgentConfig"("merchantId");

-- CreateIndex
CREATE INDEX "Product_merchantId_idx" ON "Product"("merchantId");

-- CreateIndex
CREATE INDEX "Product_merchantId_createdAt_id_idx" ON "Product"("merchantId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_merchantId_platformProductId_key" ON "Product"("merchantId", "platformProductId");

-- CreateIndex
CREATE INDEX "Customer_merchantId_idx" ON "Customer"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_merchantId_phone_key" ON "Customer"("merchantId", "phone");

-- CreateIndex
CREATE INDEX "Order_merchantId_idx" ON "Order"("merchantId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_merchantId_platformOrderId_key" ON "Order"("merchantId", "platformOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_currentOrderId_key" ON "Conversation"("currentOrderId");

-- CreateIndex
CREATE INDEX "Conversation_merchantId_idx" ON "Conversation"("merchantId");

-- CreateIndex
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");

-- CreateIndex
CREATE INDEX "Conversation_state_idx" ON "Conversation"("state");

-- CreateIndex
CREATE UNIQUE INDEX "Message_whatsappMessageId_key" ON "Message"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "WilayaDeliveryCost_merchantId_idx" ON "WilayaDeliveryCost"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "WilayaDeliveryCost_merchantId_wilayaCode_key" ON "WilayaDeliveryCost"("merchantId", "wilayaCode");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_merchantId_key" ON "WhatsAppSession"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_sessionId_key" ON "WhatsAppSession"("sessionId");

-- CreateIndex
CREATE INDEX "Notification_merchantId_read_idx" ON "Notification"("merchantId", "read");

-- CreateIndex
CREATE INDEX "Notification_merchantId_createdAt_idx" ON "Notification"("merchantId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "StoreConnection" ADD CONSTRAINT "StoreConnection_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyConnection" ADD CONSTRAINT "ShopifyConnection_storeConnectionId_fkey" FOREIGN KEY ("storeConnectionId") REFERENCES "StoreConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConfig" ADD CONSTRAINT "AgentConfig_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_currentOrderId_fkey" FOREIGN KEY ("currentOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WilayaDeliveryCost" ADD CONSTRAINT "WilayaDeliveryCost_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
