import { Router, Response } from "express";
import shopifyRoutes from "./shopify/shopify.routes";
import { authenticate, AuthenticatedRequest } from "../../middlwares/auth.middlware";
import prisma from "../../config/db.config";

const router = Router();

router.use('/shopify', shopifyRoutes);

router.get("/status", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId;
  const connection = await prisma.storeConnection.findFirst({
    where: { merchantId, isActive: true },
    select: { source: true, storeName: true, storeUrl: true },
  });
  res.json({ connected: !!connection, ...connection });
});

export default router;
