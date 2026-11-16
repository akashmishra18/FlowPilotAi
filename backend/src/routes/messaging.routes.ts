import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import * as messagingController from '../controllers/messagingController';

const router = Router();
router.use(authenticate);

router.get('/contacts', messagingController.contacts);
router.get('/conversations', messagingController.conversations);
router.post('/conversations', [body('recipientId').isMongoId()], validateRequest, messagingController.startConversation);
router.get('/conversations/:conversationId/messages', [param('conversationId').isMongoId()], validateRequest, messagingController.messages);
router.post('/conversations/:conversationId/messages', [
  param('conversationId').isMongoId(),
  body('body').isString().trim().notEmpty().isLength({ max: 4000 }),
  body('relatedTaskId').optional().isMongoId(),
], validateRequest, messagingController.sendMessage);
router.patch('/conversations/:conversationId/read', [param('conversationId').isMongoId()], validateRequest, messagingController.markConversationRead);

export default router;
