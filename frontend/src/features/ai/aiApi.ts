import { apiClient, refreshAccessToken } from '@/services/apiClient';
import { useAuthStore } from '@/store/authStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api';

export type AgentStreamEvent =
  | { type: 'phase'; phase: 'planning' | 'running_tool' | 'awaiting_approval' }
  | { type: 'text'; text: string }
  | { type: 'workflow'; workflow: Record<string, unknown> }
  | { type: 'error'; message: string };

/** Authenticated SSE request with one shared, bounded refresh retry on 401. */
export async function streamAgentWorkflow(request: string, onEvent: (event: AgentStreamEvent) => void): Promise<void> {
  const send = async (token: string | null) => fetch(`${API_BASE.replace(/\/$/, '')}/agent-workflows/stream`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ request }),
  });

  let response = await send(useAuthStore.getState().accessToken);
  if (response.status === 401) {
    const { accessToken } = await refreshAccessToken();
    response = await send(accessToken);
  }
  if (!response.ok) {
    let message = 'The workflow could not be started. Please try again.';
    try { message = (await response.json() as { message?: string }).message ?? message; } catch { /* keep safe fallback */ }
    throw new Error(message);
  }
  if (!response.body) throw new Error('The server did not open the workflow stream. Please try again.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];
  let completed = false;
  let done = false;
  const dispatch = () => {
    if (dataLines.length === 0) return;
    let data: Record<string, unknown>;
    try { data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>; }
    catch { throw new Error('The workflow stream returned an invalid response. Please try again.'); }
    if (eventName === 'error') throw new Error(typeof data.message === 'string' ? data.message : 'The workflow could not be completed.');
    if (eventName === 'workflow') { completed = true; onEvent({ type: 'workflow', workflow: data }); }
    else if (eventName === 'phase' && typeof data.phase === 'string' && ['planning', 'running_tool', 'awaiting_approval'].includes(data.phase)) onEvent({ type: 'phase', phase: data.phase as 'planning' | 'running_tool' | 'awaiting_approval' });
    else if (eventName === 'text' && typeof data.text === 'string') onEvent({ type: 'text', text: data.text });
    eventName = 'message'; dataLines = [];
  };

  try {
    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;
      const { value } = chunk;
      buffer += decoder.decode(value, { stream: !done });
      let separator = buffer.indexOf('\n');
      while (separator >= 0) {
        const line = buffer.slice(0, separator).replace(/\r$/, '');
        buffer = buffer.slice(separator + 1);
        if (!line) dispatch();
        else if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        separator = buffer.indexOf('\n');
      }
    }
    if (buffer.trim()) {
      if (buffer.startsWith('data:')) dataLines.push(buffer.slice(5).trimStart());
      dispatch();
    }
  } finally { reader.releaseLock(); }
  if (!completed) throw new Error('The connection ended before FlowPilot returned a result. You can try again.');
}

export interface OverdueAssistantTask {
  id: string;
  title: string;
  project: { id: string; name: string; projectCode: string } | null;
  assignedEmployee: { id: string; employeeId: string; name: string | null } | null;
  dueDate: string | null;
  status: string;
}

export interface OverdueAssistantResponse {
  summary: string;
  tasks: OverdueAssistantTask[];
  total: number;
  summarySource: 'AI' | 'RULE_BASED';
  fallbackReason: 'provider_unconfigured' | 'provider_error' | 'invalid_provider_response' | null;
}

export async function getOverdueTaskAssistant(): Promise<OverdueAssistantResponse> {
  const response = await apiClient.get('/tasks/overdue-assistant');
  return response.data.data as OverdueAssistantResponse;
}
