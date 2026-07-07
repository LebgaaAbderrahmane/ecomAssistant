// src/modules/order/order.routes.ts
import express,{ Router } from 'express';
import * as controller from './orders.controller';
import { authenticate } from '../../middlwares/auth.middlware';
import { validate } from '../../middlwares/validation.middleware';
import { getOrdersSchema } from '../../validators/order.validator';
import { FakeOrderSchema } from '../../validators/order.validator';

const router: Router = express.Router();

router.get('/', authenticate, validate(getOrdersSchema), controller.listOrders);
router.post('/simulate-order', validate(FakeOrderSchema), controller.postFakeOrder);

export default router;