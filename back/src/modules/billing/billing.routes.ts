import express, { Router } from 'express';
import * as controller from './billing.controller';
import { authenticate } from '../../middlwares/auth.middlware';
import { validate } from '../../middlwares/validation.middleware';
import { BillingSchema } from '../../validators/billing.validator';

const router: Router = express.Router();

router.get('/webhook', controller.connect);
router.get('/payment/success', controller.paymentSuccess);
router.get('/payment/failure', controller.paymentFailure);
router.post('/checkout', authenticate, validate(BillingSchema), controller.createCheckout);

export default router;
