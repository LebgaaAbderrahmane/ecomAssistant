import prisma from "../../config/db.config";
import type { Prisma } from "@prisma/client";

export const conversationService = {
  getByPhone: async (merchantId: string, phone: string) => {
    const clean = phone.replace(/^\+/, "");
    const customer = await prisma.customer.findFirst({
      where: {
        merchantId,
        phone: { in: [`+${clean}`, clean] },
      },
    });
    if (!customer) return null;

    return prisma.conversation.findFirst({
      where: { merchantId, customerId: customer.id },
      include: { messages: { orderBy: { createdAt: "asc" } }, customer: true },
    });
  },

  addMessage: async (
    conversationId: string,
    role: "agent" | "customer" | "system",
    content: string,
    opts: {
      contentType?: string;
      mediaUrl?: string;
      mimeType?: string;
      createdAt?: Date;
    } = {},
  ) => {
    const now = opts.createdAt ?? new Date();
    const [message] = await Promise.all([
      prisma.message.create({
        data: {
          conversationId,
          role,
          content,
          contentType: opts.contentType ?? "text",
          mediaUrl: opts.mediaUrl ?? null,
          mimeType: opts.mimeType ?? null,
          createdAt: now,
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
    ]);
    return message;
  },

  getById: async (id: string) => {
    return prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        customer: true,
      },
    });
  },

  markAsRead: async (id: string) => {
    return prisma.conversation.update({
      where: { id },
      data: { lastReadMessageAt: new Date() },
    });
  },

  updateStatus: async (id: string, status: string) => {
    return prisma.conversation.update({
      where: { id },
      data: { status },
    });
  },

  findOrCreateByCustomer: async (
    merchantId: string,
    customerId: string,
    customerPhone: string,
  ) => {
    const existing = await prisma.conversation.findUnique({
      where: { merchantId_customerId: { merchantId, customerId } },
    });
    if (existing) return existing;

    return prisma.conversation.create({
      data: {
        merchantId,
        customerId,
        customerPhone,
        status: "active",
      },
    });
  },

  createFromOrder: async (
    merchantId: string,
    orderId: string,
    customerId: string,
    customerPhone: string,
  ) => {
    const existing = await prisma.conversation.findUnique({
      where: { merchantId_customerId: { merchantId, customerId } },
    });
    if (existing) {
      await prisma.conversation.update({
        where: { id: existing.id },
        data: { currentOrderId: orderId },
      });
      return existing;
    }

    return prisma.conversation.create({
      data: {
        merchantId,
        customerId,
        customerPhone,
        currentOrderId: orderId,
        status: "active",
      },
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
      where.customer = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          customer: true,
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
          _count: {
            select: {
              messages: {
                where: {
                  role: "customer",
                  OR: [
                    { conversation: { lastReadMessageAt: null } },
                    { createdAt: { gt: undefined as unknown as Date } },
                  ],
                },
              },
            },
          },
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

    const result = await Promise.all(
      data.map(async (conv) => {
        const unreadWhere: Prisma.MessageWhereInput = {
          conversationId: conv.id,
          role: "customer",
        };
        if (conv.lastReadMessageAt) {
          unreadWhere.createdAt = { gt: conv.lastReadMessageAt };
        }
        const unreadCount = await prisma.message.count({
          where: unreadWhere,
        });
        return { ...conv, unreadCount };
      }),
    );

    return {
      data: result,
      pagination: {
        total,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      },
    };
  },
};
