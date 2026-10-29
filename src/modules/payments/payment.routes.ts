import { Router } from 'express';
import { paymentController } from './payment.controller';

export const sslcommerzRouter = Router();

sslcommerzRouter.get('/mock', paymentController.mockInfo);
sslcommerzRouter.get('/mock/:attemptId', paymentController.handleMockPay);
sslcommerzRouter.get('/success', paymentController.handleSuccess);
sslcommerzRouter.get('/fail', paymentController.handleFail);
sslcommerzRouter.get('/cancel', paymentController.handleCancel);
sslcommerzRouter.post('/ipn', paymentController.handleIpn);
