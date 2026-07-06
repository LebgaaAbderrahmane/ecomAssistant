import { EventEmitter } from "events";
import prisma from "../../config/db.config";
import type { Prisma } from "@prisma/client";

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export interface SessionStatusEvent {
  merchantId: string;
  status: string;
  phoneNumber?: string;
}

export interface NotificationCreatedEvent {
  merchantId: string;
  notification: {
    id: string;
    type: string;
    title: string;
    message: string;
    link: string | null;
    read: boolean;
    createdAt: Date;
  };
}

export const notificationService = {
  emitSessionStatus: (data: SessionStatusEvent) => {
    emitter.emit("session.status", data);
  },

  onSessionStatus: (listener: (data: SessionStatusEvent) => void) => {
    emitter.on("session.status", listener);
  },

  offSessionStatus: (listener: (data: SessionStatusEvent) => void) => {
    emitter.off("session.status", listener);
  },

  emitNotificationCreated: (data: NotificationCreatedEvent) => {
    emitter.emit("notification.created", data);
  },

  onNotificationCreated: (listener: (data: NotificationCreatedEvent) => void) => {
    emitter.on("notification.created", listener);
  },

  offNotificationCreated: (listener: (data: NotificationCreatedEvent) => void) => {
    emitter.off("notification.created", listener);
  },

  createNotification: async (
    merchantId: string,
    type: string,
    title: string,
    message: string,
    link?: string,
  ) => {
    const notification = await prisma.notification.create({
      data: { merchantId, type, title, message, link: link ?? null },
    });

    notificationService.emitNotificationCreated({
      merchantId,
      notification: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        link: notification.link,
        read: notification.read,
        createdAt: notification.createdAt,
      },
    });

    return notification;
  },

  list: async (
    merchantId: string,
    params: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ) => {
    const { unreadOnly, limit = 20, offset = 0 } = params;

    const where: Prisma.NotificationWhereInput = { merchantId };
    if (unreadOnly) where.read = false;

    const [data, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit + 1,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { merchantId, read: false } }),
    ]);

    const hasMore = data.length > limit;
    if (hasMore) data.pop();

    return {
      data,
      unreadCount,
      pagination: {
        total,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      },
    };
  },

  markAsRead: async (id: string, merchantId: string) => {
    return prisma.notification.updateMany({
      where: { id, merchantId },
      data: { read: true },
    });
  },

  markAllAsRead: async (merchantId: string) => {
    return prisma.notification.updateMany({
      where: { merchantId, read: false },
      data: { read: true },
    });
  },
};
