-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "parsedIntents" JSONB,
ADD COLUMN     "toolResults" JSONB;
