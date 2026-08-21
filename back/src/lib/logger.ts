import pino from 'pino'

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'development' ? 'debug' : 'info')

export const logger = pino({
  level,
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    },
  }),
})

export type Bindings = Record<string, string | number | boolean | undefined>

export function createChildLogger(bindings: Bindings): pino.Logger {
  return logger.child(bindings)
}

// ─── Typed factory helpers ────────────────────────────────────────────────
// Each factory produces a child logger pre-bound with the relevant identifiers.
// All fields are structured and queryable in production (JSON mode).

type MessageContext = {
  conversationId: string
  messageId: string
}

type ConversationContext = {
  conversationId: string
}

type Layer2Context = {
  conversationId: string
  messageId: string
  generation: number
}

export function msgLogger(ctx: MessageContext): pino.Logger {
  return logger.child({ conversationId: ctx.conversationId, messageId: ctx.messageId })
}

export function convLogger(ctx: ConversationContext): pino.Logger {
  return logger.child({ conversationId: ctx.conversationId })
}

export function layer2Logger(ctx: Layer2Context): pino.Logger {
  return logger.child({
    conversationId: ctx.conversationId,
    messageId: ctx.messageId,
    generation: ctx.generation,
  })
}

export function moduleLogger(module: string, extra?: Bindings): pino.Logger {
  return logger.child({ module, ...extra })
}
