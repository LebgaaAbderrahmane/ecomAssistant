import prisma from "../../config/db.config";
import type { ConversationStatus, Prisma } from "@prisma/client";

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
      direction?: "IN" | "OUT";
      sender?: "CUSTOMER" | "AI" | "MERCHANT";
      contentType?: string;
      mediaUrl?: string;
      mimeType?: string;
      rawPayload?: Record<string, unknown>;
      messageType?: "text" | "voice" | "image";
      filePath?: string;
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
          text: content,
          direction: opts.direction ?? (role === "customer" ? "IN" : "OUT"),
          sender: opts.sender ?? (role === "customer" ? "CUSTOMER" : "AI"),
          contentType: opts.contentType ?? "text",
          mediaUrl: opts.mediaUrl ?? null,
          mimeType: opts.mimeType ?? null,
          rawPayload: (opts.rawPayload as Prisma.InputJsonValue) ?? undefined,
          messageType: opts.messageType ?? "text",
          filePath: opts.filePath ?? null,
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

  updateStatus: async (id: string, status: "ACTIVE" | "RESOLVED") => {
    return prisma.conversation.update({
      where: { id },
      data: { status },
    });
  },

  /**
   * Race-safe find-or-create for a customer's conversation. Uses an atomic
   * `upsert` on the `@@unique([merchantId, customerId])` key so concurrent
   * requests for the same merchant+customer can never both attempt a `create`
   * and collide on the unique constraint (P2002). Because there is exactly one
   * conversation per merchant+customer, an existing conversation is always
   * continued rather than creating a duplicate.
   */
  findOrCreateByCustomer: async (
    merchantId: string,
    customerId: string,
    customerPhone: string,
  ) => {
    return prisma.conversation.upsert({
      where: { merchantId_customerId: { merchantId, customerId } },
      update: {},
      create: {
        merchantId,
        customerId,
        customerPhone,
        status: "ACTIVE",
      },
    });
  },

  createFromOrder: async (
    merchantId: string,
    orderId: string,
    customerId: string,
    customerPhone: string,
  ) => {
    return prisma.conversation.upsert({
      where: { merchantId_customerId: { merchantId, customerId } },
      update: { currentOrderId: orderId },
      create: {
        merchantId,
        customerId,
        customerPhone,
        currentOrderId: orderId,
        status: "ACTIVE",
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
    if (status) where.status = status as ConversationStatus;
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
