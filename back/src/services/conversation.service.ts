import prisma from "../config/db.config";

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
};
