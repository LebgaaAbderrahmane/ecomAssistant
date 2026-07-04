import { Response } from "express";
import { conversationService } from "./conversation.service";
import { AuthenticatedRequest } from "../../middlwares/auth.middlware";

export async function listConversations(
  req: AuthenticatedRequest,
  res: Response,
) {
  const merchantId = req.merchant!.merchantId;
  const { status, search, limit, offset } = req.query as Record<string, string | undefined>;

  const result = await conversationService.list({
    merchantId,
    status,
    search,
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined,
  });

  res.json(result);
}

export async function getConversation(
  req: AuthenticatedRequest,
  res: Response,
) {
  const merchantId = req.merchant!.merchantId;
  const { id } = req.params;

  const conversation = await conversationService.getById(id);
  if (!conversation || conversation.merchantId !== merchantId) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  res.json(conversation);
}
