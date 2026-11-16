import { FormEvent, useCallback, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeading, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { useAsyncData } from '@/hooks/useAsyncData';
import { parseApiError } from '@/services/errorHelpers';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { createTaskReassignmentRequest, decideTaskReassignment, listTaskReassignmentRequests } from '@/features/approvals/approvalsApi';
import TaskReassignmentPicker from '@/features/approvals/TaskReassignmentPicker';

const STATUS_LABEL: Record<'PENDING' | 'EXECUTING' | 'APPROVED' | 'REJECTED' | 'FAILED', string> = {
  PENDING: 'Pending review',
  EXECUTING: 'Executing · retry available',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  FAILED: 'Failed · retry available',
};

export default function ApprovalsPage() {
  const user = useAuthStore((state) => state.user);
  const canReview = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const fetchRequests = useCallback(() => listTaskReassignmentRequests(), []);
  const { data, error, isInitialLoading, isLoading, reload } = useAsyncData(fetchRequests, 'Unable to load reassignment requests.');
  const [taskId, setTaskId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [pickerVersion, setPickerVersion] = useState(0);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setActionError(null);
    if (!taskId || !assignedTo) {
      setActionError('Choose a task and an active project member before submitting.');
      return;
    }
    setWorking(true);
    try {
      await createTaskReassignmentRequest(taskId.trim(), assignedTo.trim());
      setTaskId('');
      setAssignedTo('');
      setPickerVersion((version) => version + 1);
      toast.success('Reassignment request submitted for review.');
      await reload();
    } catch (err) {
      setActionError(parseApiError(err, 'Unable to submit the request.').message);
    } finally {
      setWorking(false);
    }
  };

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setActionError(null);
    setWorking(true);
    try {
      await decideTaskReassignment(id, decision);
      toast.success(decision === 'reject' ? 'Request rejected.' : 'Approval action completed.');
      await reload();
    } catch (err) {
      setActionError(parseApiError(err, `Unable to ${decision} this request.`).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <PageHeader title="Task reassignment requests" description="Ask for a task to be reassigned, or review requests in your scope. Approving a request applies the change." badge={<Badge tone="violet">Available</Badge>} actions={<Button variant="secondary" size="sm" onClick={() => void reload()} isLoading={isLoading && !isInitialLoading}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh</Button>} />

      <Card className="mb-6">
        <CardHeading title="Request a reassignment" description="Choose a task you can access, then select an active member of its project." />
        <form onSubmit={onSubmit} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <TaskReassignmentPicker key={pickerVersion} onChange={(selectedTaskId, selectedEmployeeId) => { setTaskId(selectedTaskId); setAssignedTo(selectedEmployeeId); }} />
          <div className="sm:col-span-2"><Button type="submit" isLoading={working} disabled={!taskId || !assignedTo}>Submit request</Button></div>
        </form>
      </Card>

      {actionError && <Alert tone="error" title="Action failed" className="mb-4">{actionError}</Alert>}
      {error && <Alert tone="error" title="Requests unavailable" className="mb-4" action={<Button variant="ghost" size="sm" onClick={() => void reload()}>Try again</Button>}>{error}</Alert>}

      {isInitialLoading ? <Card><Skeleton className="h-6 w-1/3" /><Skeleton className="mt-4 h-20 w-full" /></Card> : null}
      {!isInitialLoading && data?.length === 0 ? <EmptyState icon={Check} title="No reassignment requests" description="Requests you submitted or can review will appear here." /> : null}
      {!isInitialLoading && data && data.length > 0 && (
        <Card>
          <CardHeading title="Requests" description={`${data.length} request${data.length === 1 ? '' : 's'}. Pending requests can be approved or rejected; failed or stalled execution can be retried by a manager or admin.`} />
          <div className="fp-stagger space-y-3">
            {data.map((request) => {
              const task = typeof request.taskId === 'string' ? request.taskId : request.taskId?.title ?? 'Task unavailable';
              const project = typeof request.projectId === 'string' ? request.projectId : request.projectId?.name ?? 'Project unavailable';
              const target = typeof request.assignedTo === 'string' ? 'Employee' : request.assignedTo?.userId?.name ?? request.assignedTo?.employeeId ?? 'Employee';
              const source = typeof request.fromAssignedTo === 'string' ? request.fromAssignedTo : request.fromAssignedTo?.userId?.name ?? request.fromAssignedTo?.employeeId ?? 'Unassigned';
              const requester = typeof request.requestedBy === 'string' ? request.requestedBy : request.requestedBy?.name ?? 'User';
              return (
                <div key={request._id} className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 md:flex-row md:items-center">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-100">{task} <span className="font-normal text-slate-400">in {project}</span></p>
                    <p className="mt-1 text-sm text-slate-400">{requester}: {source} → {target}</p>
                    <p className="mt-1 text-xs text-slate-500">Requested {new Date(request.createdAt).toLocaleString()}</p>
                    {request.executionError && <p className="mt-1 text-sm text-rose-300">{request.executionError}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge tone={request.status === 'APPROVED' ? 'success' : request.status === 'REJECTED' || request.status === 'FAILED' ? 'danger' : request.status === 'PENDING' ? 'warning' : 'info'}>{STATUS_LABEL[request.status]}</Badge>
                    {canReview && (request.status === 'PENDING' || request.status === 'EXECUTING' || request.status === 'FAILED') && <>
                      <Button size="sm" onClick={() => void decide(request._id, 'approve')} disabled={working}><Check className="h-4 w-4" aria-hidden="true" /> {request.status === 'PENDING' ? 'Approve' : 'Retry execution'}</Button>
                      {request.status === 'PENDING' && <Button size="sm" variant="secondary" onClick={() => void decide(request._id, 'reject')} disabled={working}><X className="h-4 w-4" aria-hidden="true" /> Reject</Button>}
                    </>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
