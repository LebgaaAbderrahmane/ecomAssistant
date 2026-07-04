import prisma from "../../config/db.config";

export const agentConfigService = {
  get: async (merchantId: string) => {
    return prisma.agentConfig.findUnique({ where: { merchantId } });
  },

  upsert: async (
    merchantId: string,
    data: {
      defaultLanguage?: string;
      tone?: string;
      followUpDelays?: number[];
      maxFollowUps?: number;
      deliveryProvider?: string;
    },
  ) => {
    return prisma.agentConfig.upsert({
      where: { merchantId },
      create: { merchantId, ...data, followUpDelays: data.followUpDelays ?? [2, 24, 48] },
      update: data,
    });
  },

  activate: async (merchantId: string) => {
    return prisma.agentConfig.upsert({
      where: { merchantId },
      create: { merchantId, isActive: true },
      update: { isActive: true },
    });
  },
};
