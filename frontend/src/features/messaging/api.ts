import { apiClient } from '@/services/apiClient';

export interface MessageContact { id: string; name: string; email: string; role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE' }
export interface ConversationSummary {
  id: string;
  participant: { id: string; name: string; role: string; isActive: boolean };
  latestMessage: { body: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
}
export interface ChatMessage {
  _id: string;
  body: string;
  kind: 'USER' | 'OVERDUE_REMINDER';
  createdAt: string;
  readAt: string | null;
  senderId: { _id: string; name: string; role: string };
  relatedTaskId: { _id: string; title: string; status: string; dueDate: string | null } | null;
}
export interface AppNotification {
  _id: string;
  type: 'NEW_MESSAGE' | 'OVERDUE_REMINDER' | 'SCHEDULED_SUMMARY' | 'APPROVAL_UPDATE';
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
  inAppStatus: string;
  emailStatus: string;
}

export async function getMessageContacts(): Promise<MessageContact[]> {
  const { data } = await apiClient.get('/messages/contacts');
  return data.data.contacts;
}
export async function getConversations(): Promise<ConversationSummary[]> {
  const { data } = await apiClient.get('/messages/conversations');
  return data.data.conversations;
}
export async function openConversation(recipientId: string): Promise<string> {
  const { data } = await apiClient.post('/messages/conversations', { recipientId });
  return data.data.conversation._id;
}
export async function getMessages(id: string): Promise<ChatMessage[]> {
  const { data } = await apiClient.get(`/messages/conversations/${id}/messages`);
  return data.data.messages;
}
export async function sendMessage(id: string, body: string): Promise<void> {
  const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await apiClient.post(`/messages/conversations/${id}/messages`, { body }, { headers: { 'Idempotency-Key': key } });
}
export async function markConversationRead(id: string): Promise<void> {
  await apiClient.patch(`/messages/conversations/${id}/read`);
}
export async function getNotifications(): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  const { data } = await apiClient.get('/notifications');
  return data.data;
}
export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`);
}
