-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "filePath" TEXT,
ADD COLUMN     "messageType" TEXT NOT NULL DEFAULT 'text';
