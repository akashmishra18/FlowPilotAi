import { apiClient } from '@/services/apiClient';

export interface TaskReassignmentRequest {
  _id: string;
  taskId: { _id: string; title: string; status: string } | string;
  projectId: { _id: string; name: string; projectCode: string } | string;
  requestedBy: { _id: string; name: string; role: string } | string;
  fromAssignedTo: { _id: string; employeeId: string; userId?: { name: string } } | string | null;
  assignedTo: { _id: string; employeeId: string; userId?: { name: string } } | string;
  status: 'PENDING' | 'EXECUTING' | 'APPROVED' | 'REJECTED' | 'FAILED';
  executionError?: string | null;
  createdAt: string;
}

export async function listTaskReassignmentRequests(): Promise<TaskReassignmentRequest[]> {
  const response = await apiClient.get('/approvals/task-reassignments');
  return response.data.data.requests as TaskReassignmentRequest[];
}

export async function createTaskReassignmentRequest(taskId: string, assignedTo: string): Promise<void> {
  await apiClient.post('/approvals/task-reassignments', { taskId, assignedTo });
}

export async function decideTaskReassignment(id: string, decision: 'approve' | 'reject'): Promise<void> {
  await apiClient.post(`/approvals/${id}/${decision}`);
}
