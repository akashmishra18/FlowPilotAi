import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as messagingService from '../services/messagingService';

export const contacts = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await messagingService.listMessageContacts(req.user!)));
export const conversations = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await messagingService.listConversations(req.user!)));
export const startConversation = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await messagingService.startConversation(req.user!, req.body.recipientId), 201));
export const messages = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await messagingService.listMessages(req.user!, req.params.conversationId)));
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const idempotencyKey = req.get('Idempotency-Key') ?? undefined;
  sendSuccess(res, await messagingService.sendMessage(req.user!, req.params.conversationId, req.body.body, idempotencyKey, req.body.relatedTaskId));
});
export const markConversationRead = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await messagingService.markConversationRead(req.user!, req.params.conversationId)));
export const notifications = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await messagingService.listNotifications(req.user!)));
export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await messagingService.markNotificationRead(req.user!, req.params.id)));

export const reminderPreview = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await messagingService.getOverdueReminderPreview(req.user!, req.params.id)));
export const sendReminder = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await messagingService.sendOverdueReminder(req.user!, req.params.id), 201));
