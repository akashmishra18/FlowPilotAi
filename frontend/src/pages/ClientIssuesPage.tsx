import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/services/apiClient';
import { Button, Card, Field, Input, PageHeader } from '@/components/ui';

type Issue = { _id: string; clientName: string; message: string; priority: string; status: string; receivedAt: string; projectId?: { name: string } | null; assignedTo?: { employeeId: string; userId?: { name: string } } | null };

export default function ClientIssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState('');
  const [clientName, setClientName] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const { data } = await apiClient.get('/client-issues', { params: status ? { status } : {} }); setIssues(data.data.issues); setError(''); }
    catch { setError('Could not load client issues. Try again.'); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try { await apiClient.post('/client-issues', { clientName, message, priority }); setClientName(''); setMessage(''); setPriority('MEDIUM'); await load(); }
    catch { setError('Issue could not be saved. Check the details and your access.'); }
  }
  async function changeStatus(issue: Issue, next: string) {
    try { await apiClient.patch(`/client-issues/${issue._id}`, { status: next }); await load(); }
    catch { setError('Issue status could not be updated.'); }
  }
  return <div>
    <PageHeader title="Client issues" description="Manual intake queue. WhatsApp Business is not connected." />
    <div className="grid gap-5 lg:grid-cols-[minmax(17rem,0.8fr)_1.2fr]">
      <Card><h2 className="mb-4 font-semibold">Record an incoming issue</h2><form className="space-y-4" onSubmit={(e) => void submit(e)}>
        <Field label="Client name">{(control) => <Input {...control} value={clientName} onChange={(e) => setClientName(e.target.value)} required maxLength={120} />}</Field>
        <Field label="Message">{(control) => <textarea {...control} className="min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={4000} />}</Field>
        <Field label="Priority">{(control) => <select {...control} className="w-full rounded-lg border border-slate-300 p-3" value={priority} onChange={(e) => setPriority(e.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select>}</Field>
        <Button type="submit">Save issue</Button>
      </form></Card>
      <section><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Issue queue</h2><select aria-label="Filter issues by status" className="rounded-lg border border-slate-300 p-2" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option>NEW</option><option>IN_PROGRESS</option><option>RESOLVED</option></select></div>
        {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
        <div className="fp-stagger space-y-3">{issues.map((issue) => <Card key={issue._id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{issue.clientName} <span className="text-xs text-slate-500">· {issue.priority}</span></h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{issue.message}</p><p className="mt-2 text-xs text-slate-500">{new Date(issue.receivedAt).toLocaleString()} {issue.projectId?.name ? `· ${issue.projectId.name}` : ''}</p></div><select aria-label={`Status for ${issue.clientName}`} className="rounded border p-2 text-sm" value={issue.status} onChange={(e) => void changeStatus(issue, e.target.value)}><option>NEW</option><option>IN_PROGRESS</option><option>RESOLVED</option></select></div></Card>)}
        {!issues.length && !error && <Card><p className="text-sm text-slate-600">No client issues in this view.</p></Card>}</div>
      </section>
    </div>
  </div>;
}
