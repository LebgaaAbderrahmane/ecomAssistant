import { z } from 'zod';

export const FakeMessageSchema = z.object({
  merchantId: z.string(),
  customerPhone: z.string(),
  text: z.string().min(1),
});

export type FakeMessageInput = z.infer<typeof FakeMessageSchema>;