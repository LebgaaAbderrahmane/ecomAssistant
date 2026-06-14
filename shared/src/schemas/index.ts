import { z } from 'zod'

export const storePlatformSchema = z.enum(['shopify', 'woocommerce'])
export const languageSchema = z.enum(['derdja', 'french', 'arabic'])
export const agentToneSchema = z.enum(['formal', 'friendly'])
export const orderStatusSchema = z.enum(['pending', 'confirmed', 'cancelled', 'failed'])
export const deliveryProviderSchema = z.enum(['yalidine', 'procolis'])

export const agentConfigSchema = z.object({
  defaultLanguage: z.union([languageSchema, z.literal('auto')]),
  tone: agentToneSchema,
  followUpDelays: z.tuple([z.number(), z.number(), z.number()]),
  maxFollowUps: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  deliveryProvider: deliveryProviderSchema.nullable(),
})

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const wilayaCostMatrixSchema = z.array(
  z.object({
    wilaya: z.string(),
    wilayaCode: z.number().int().min(1).max(48),
    cost: z.number().nonnegative(),
  })
)
