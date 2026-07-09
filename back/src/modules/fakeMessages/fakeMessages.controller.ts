import { Request, Response } from 'express';
import { FakeMessageSchema } from '../../validators/messages.validator';
import { ingestFakeMessage } from './fakeMessages.service';
import { FakeMessageInput } from '../../validators/messages.validator'
export const postFakeMessage = async (req: Request, res: Response) => {
  try {
    const { data } = FakeMessageSchema.safeParse(req.body);
    const result = await ingestFakeMessage(data as FakeMessageInput);
    return res.status(202).json(result);
  } catch (error) {
    console.error('[FakeMessage] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};