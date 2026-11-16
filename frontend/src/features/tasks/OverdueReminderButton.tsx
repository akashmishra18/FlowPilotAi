import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Alert, Button, Modal } from '@/components/ui';
import { getReminderPreview, ReminderPreview, sendOverdueReminder } from './remindersApi';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';

export default function OverdueReminderButton({ taskId, disabled = false, onSent }: { taskId: string; disabled?: boolean; onSent?: () => void }) {
  const role = useAuthStore((s) => s.user?.role);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    getReminderPreview(taskId).then((value) => { if (alive) setPreview(value); }).catch(() => { if (alive) setError('Task reminder details could not be loaded. You may not manage this task.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, taskId]);

  if (role !== 'ADMIN' && role !== 'MANAGER') return null;

  async function confirm() {
    setSending(true);
    try {
      const result = await sendOverdueReminder(taskId);
      if (result.duplicate) toast.info('A reminder was already recorded for this task today.');
      else if (result.reminder?.recipientStatuses?.some((status) => status.inAppStatus === 'FAILED')) toast.error('The task reminder was saved, but at least one in-app notification could not be delivered.');
      else {
        const statuses = [...new Set(result.reminder?.recipientStatuses?.map((status) => status.emailStatus) ?? [])];
        const emailMessage = statuses.length ? ` Email: ${statuses.map((status) => status.toLowerCase().replace('_', ' ')).join(', ')}.` : '';
        toast.success(`In-app reminder delivered.${emailMessage}`);
      }
      setOpen(false);
      onSent?.();
    } catch { setError('Reminder could not be sent. Check task assignment and your permissions, then try again.'); }
    finally { setSending(false); }
  }

  return <>
    <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(true)}><Bell className="h-3.5 w-3.5" aria-hidden="true" /> Send reminder</Button>
    {open && <Modal title="Send overdue reminder" description="Confirm the task and recipients before sending an in-app reminder." onClose={() => setOpen(false)}>
      {loading ? <p className="text-sm text-slate-600">Loading task and recipient details…</p> : preview ? <dl className="space-y-3 text-sm"><div><dt className="text-slate-500">Task</dt><dd className="font-medium text-slate-900">{preview.task.title} · {preview.task.project}</dd></div><div><dt className="text-slate-500">Assigned employee</dt><dd className="font-medium text-slate-900">{preview.assignedEmployee.name ?? 'Employee'}</dd></div><div><dt className="text-slate-500">Reporting manager</dt><dd className="font-medium text-slate-900">{preview.manager?.name ?? 'No active reporting manager'}</dd></div><div><dt className="text-slate-500">Project manager</dt><dd className="font-medium text-slate-900">{preview.projectManager.name ?? 'Project manager'}</dd></div><p className="text-xs text-slate-500">A reminder is sent once per task per day. In-app and email delivery statuses are shown after sending.</p></dl> : null}
      {error && <Alert tone="error" title="Reminder not sent" className="mt-4">{error}</Alert>}
      <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" disabled={!preview || loading || Boolean(error)} isLoading={sending} onClick={() => void confirm()}>Confirm reminder</Button></div>
    </Modal>}
  </>;
}
