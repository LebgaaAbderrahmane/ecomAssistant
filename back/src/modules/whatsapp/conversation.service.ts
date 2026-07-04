import prisma from "../../config/db.config";
import type { Prisma } from "@prisma/client";

export const conversationService = {
  getByPhone: async (merchantId: string, phone: string) => {
    return prisma.conversation.findFirst({
      where: { merchantId, customerPhone: phone },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  },

  addMessage: async (
    conversationId: string,
    role: "agent" | "customer" | "system",
    content: string,
    contentType: string = "text",
  ) => {
    const [message] = await Promise.all([
      prisma.message.create({
        data: { conversationId, role, content, contentType },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return message;
  },

  getById: async (id: string) => {
    return prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  },

  updateStatus: async (id: string, status: string) => {
    return prisma.conversation.update({
      where: { id },
      data: { status },
    });
  },

  list: async (params: {
    merchantId: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const { merchantId, status, search, limit = 20, offset = 0 } = params;

    const where: Prisma.ConversationWhereInput = { merchantId };
    if (status) where.status = status;
    if (search) {
      where.order = {
        OR: [
          { customerName: { contains: search, mode: "insensitive" } },
          { customerPhone: { contains: search } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          order: true,
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: [
          { lastMessageAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        skip: offset,
        take: limit + 1,
      }),
      prisma.conversation.count({ where }),
    ]);

    const hasMore = data.length > limit;
    if (hasMore) data.pop();

    return {
      data,
      pagination: { total, hasMore, nextOffset: hasMore ? offset + limit : null },
    };
  },
};
