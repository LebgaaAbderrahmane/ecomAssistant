import prisma from "../../config/db.config";
import { PaginatedResult } from "../../types/pagination.types";

interface GetEscalationsParams {
  merchantId: string;
  cursor?: string;
  limit?: number | string;
}

const encodeCursor = (escalatedAt: Date, id: string): string =>
  Buffer.from(JSON.stringify({ escalatedAt: escalatedAt.toISOString(), id })).toString("base64url");

const decodeCursor = (cursor: string): { escalatedAt: Date; id: string } => {
  const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  return { escalatedAt: new Date(decoded.escalatedAt), id: decoded.id };
};

export const getEscalations = async (
  params: GetEscalationsParams,
): Promise<PaginatedResult<any>> => {
  const { merchantId, cursor } = params;
  const limit = Math.min(Number(params.limit) || 20, 100);

  const where: any = {
    merchantId,
    escalatedAt: { not: null },
    status: { not: "resolved" },
  };

  let cursorWhere = {};
  let decodedCursor: { escalatedAt: Date; id: string } | null = null;

  if (cursor) {
    decodedCursor = decodeCursor(cursor);
    cursorWhere = {
      OR: [
        { escalatedAt: { lt: decodedCursor.escalatedAt } },
        {
          escalatedAt: { equals: decodedCursor.escalatedAt },
          id: { lt: decodedCursor.id },
        },
      ],
    };
  }

  const conversations = await prisma.conversation.findMany({
    where: { ...where, ...cursorWhere },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ escalatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasNextPage = conversations.length > limit;
  if (hasNextPage) conversations.pop();

  const nextCursor =
    hasNextPage
      ? encodeCursor(conversations[conversations.length - 1].escalatedAt!, conversations[conversations.length - 1].id)
      : null;

  const prevCursor = decodedCursor
    ? encodeCursor(conversations[0].escalatedAt!, conversations[0].id)
    : null;

  return {
    data: conversations,
    pagination: {
      hasNextPage,
      hasPrevPage: !!cursor,
      nextCursor,
      prevCursor,
    },
  };
};

export const resolveEscalation = async (conversationId: string, merchantId: string) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, merchantId },
  });
  if (!conversation) return null;

  return prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "resolved" },
  });
};

export const resolveAllEscalations = async (merchantId: string) => {
  return prisma.conversation.updateMany({
    where: {
      merchantId,
      escalatedAt: { not: null },
      status: { not: "resolved" },
    },
    data: { status: "resolved" },
  });
};
