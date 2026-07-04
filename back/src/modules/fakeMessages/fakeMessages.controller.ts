import { Request, Response } from 'express';
import { FakeMessageSchema } from '../../validators/messages.validator';
import { ingestFakeMessage } from './fakeMessages.service';
import { FakeMessageInput } from '../../validators/messages.validator'
export const postFakeMessage = async (req: Request, res: Response) => {
  const { data } = FakeMessageSchema.safeParse(req.body);
  const result = await ingestFakeMessage(data as FakeMessageInput);
  return res.status(202).json(result);
};