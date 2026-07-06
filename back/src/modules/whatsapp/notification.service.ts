import { EventEmitter } from "events";

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export interface SessionStatusEvent {
  merchantId: string;
  status: string;
  phoneNumber?: string;
}

export const notificationService = {
  emitSessionStatus: (data: SessionStatusEvent) => {
    emitter.emit("session.status", data);
  },

  onSessionStatus: (
    listener: (data: SessionStatusEvent) => void,
  ) => {
    emitter.on("session.status", listener);
  },

  offSessionStatus: (
    listener: (data: SessionStatusEvent) => void,
  ) => {
    emitter.off("session.status", listener);
  },
};
