import { apiClient } from '@/services/apiClient';

export interface ReminderPreview {
  task: { id: string; title: string; project: string; dueDate: string };
  assignedEmployee: { id: string; name: string | null };
  manager: { id: string; name: string | null } | null;
  projectManager: { id: string; name: string | null };
}
export async function getReminderPreview(taskId: string): Promise<ReminderPreview> {
  const { data } = await apiClient.get(`/tasks/${taskId}/reminder-preview`);
  return data.data;
}
export async function sendOverdueReminder(taskId: string): Promise<{
  duplicate: boolean;
  reminder: { recipientStatuses?: Array<{ userId: string; inAppStatus: 'DELIVERED' | 'FAILED'; emailStatus: 'PENDING' | 'SENT' | 'FAILED' | 'NOT_CONFIGURED' }> } | null;
}> {
  const { data } = await apiClient.post(`/tasks/${taskId}/reminders`);
  return data.data;
}
