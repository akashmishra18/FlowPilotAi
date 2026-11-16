import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowUp, CircleAlert, ClipboardCheck, Clock3, LoaderCircle, RotateCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import Logo from '@/components/Logo';
import MarkdownContent from '@/components/ui/MarkdownContent';
import { AgentStreamEvent, streamAgentWorkflow } from '@/features/ai/aiApi';
import { apiClient } from '@/services/apiClient';

interface OverdueTask {
  _id?: string;
  title?: string;
  status?: string;
  dueDate?: string | null;
  projectId?: string | { name?: string } | null;
  assignedTo?: { employeeId?: string; userId?: { name?: string } | null } | null;
}

interface WorkflowResult {
  total?: number;
  tasks?: OverdueTask[];
  taskTitle?: string;
  targetEmployeeName?: string;
  approvalId?: string;
  snapshotCaptured?: boolean;
}

type ApprovalReference = string | { status?: string } | null;
type Workflow = {
  _id: string;
  request: string;
  tool: string;
  risk: string;
  status: string;
  approvalId?: ApprovalReference;
  result: WorkflowResult | null;
  rationale?: string;
  createdAt: string;
};

type ActiveStream = { phase: 'planning' | 'running_tool' | 'awaiting_approval'; rationale: string };
type DraftTurn = { request: string; error?: string };

const phaseLabels: Record<ActiveStream['phase'], string> = {
  planning: 'Planning a safe workflow',
  running_tool: 'Checking your authorized work',
  awaiting_approval: 'Preparing the approval request',
};

const examples = [
  'Show my overdue tasks',
  'Request reassignment of [task title] from [current employee] to [new employee]',
];

function readableStatus(status: string) {
  const labels: Record<string, string> = {
    AWAITING_APPROVAL: 'Pending approval', PENDING: 'Pending approval', EXECUTING: 'Executing',
    APPROVED: 'Approved', REJECTED: 'Rejected', FAILED: 'Execution failed', COMPLETED: 'Completed',
  };
  return labels[status] ?? 'Status unavailable';
}

function workflowStatus(item: Workflow) {
  const approvalStatus = typeof item.approvalId === 'object' && item.approvalId ? item.approvalId.status : undefined;
  return readableStatus(approvalStatus ?? item.status);
}

function workflowStateClass(status: string) {
  if (status === 'Pending approval') return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
  if (status === 'Executing') return 'border-brand-400/30 bg-brand-500/10 text-brand-200';
  if (status === 'Approved' || status === 'Completed') return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200';
  if (status === 'Rejected') return 'border-slate-600 bg-slate-800 text-slate-300';
  if (status === 'Execution failed') return 'border-rose-400/30 bg-rose-500/10 text-rose-200';
  return 'border-slate-700 bg-slate-800 text-slate-300';
}

function displayDate(value?: string | null) {
  if (!value) return 'No due date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Due date unavailable' : date.toLocaleDateString();
}

function projectName(task: OverdueTask) {
  return typeof task.projectId === 'object' && task.projectId ? task.projectId.name ?? 'Project unavailable' : 'Project unavailable';
}

function taskSummary(result: WorkflowResult) {
  const count = typeof result.total === 'number' ? result.total : (result.tasks?.length ?? 0);
  if (count === 0) return 'There are no overdue tasks in your accessible work.';
  return `${count} overdue task${count === 1 ? '' : 's'} in your accessible work.`;
}

function WorkflowResponse({ item }: { item: Workflow }) {
  const result = item.result;
  const status = workflowStatus(item);
  const isOverdueLookup = item.tool === 'list_overdue_tasks';

  return (
    <article className="agent-message-enter group flex gap-3 sm:gap-4" aria-label="FlowPilot response">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-xs text-slate-400">
          <span className="font-semibold text-amber-200">FlowPilot</span>
          <span>{isOverdueLookup ? 'Overdue task lookup' : 'Task reassignment'}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
          <span className={`rounded-full border px-2 py-0.5 ${item.risk === 'HIGH' ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-slate-700 bg-slate-800/80 text-slate-300'}`}>{item.risk} risk</span>
          <span className={`rounded-full border px-2 py-0.5 ${workflowStateClass(status)}`}>{status}</span>
        </div>

        {item.rationale && <div className="mb-5 max-w-[68ch] rounded-xl border border-amber-400/15 bg-amber-400/[0.035] px-4 py-3 leading-relaxed text-slate-300"><MarkdownContent content={item.rationale} /></div>}

        {isOverdueLookup ? (
          <section aria-label="Overdue task results" className="space-y-4">
            <p className="max-w-[70ch] border-l-2 border-amber-400/70 pl-3.5 text-[15px] font-medium leading-7 text-slate-100">{result ? taskSummary(result) : 'This workflow completed without a task result.'}</p>
            {result?.tasks?.length ? (
              <div className="agent-task-grid border-t border-slate-800/80 pt-4">
                {result.tasks.map((task, index) => (
                  <article key={task._id ?? `${task.title ?? 'task'}-${index}`} className="agent-task-card min-w-0 rounded-xl border border-slate-700/70 bg-slate-900/35 p-4 transition-colors hover:border-amber-400/35 hover:bg-slate-900/60">
                    <h3 className="break-words text-sm font-semibold text-slate-100">{task.title || 'Untitled task'}</h3>
                    <dl className="mt-3 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-xs leading-relaxed sm:grid-cols-[5rem_minmax(0,1fr)]">
                      <dt className="text-slate-500">Project</dt><dd className="truncate text-slate-300">{projectName(task)}</dd>
                      <dt className="text-slate-500">Assigned to</dt><dd className="truncate text-slate-300">{task.assignedTo?.userId?.name ?? task.assignedTo?.employeeId ?? 'Unassigned'}</dd>
                      <dt className="text-slate-500">Due</dt><dd className="text-amber-200">{displayDate(task.dueDate)}</dd>
                      <dt className="text-slate-500">Status</dt><dd className="text-slate-300">{task.status ?? 'Unavailable'}</dd>
                    </dl>
                  </article>
                ))}
              </div>
            ) : result && (result.total ?? 0) > 0 ? (
              <p className="text-sm text-slate-400">Task details were not included in the workflow result.</p>
            ) : null}
          </section>
        ) : (
          <section aria-label="Reassignment request result" className="rounded-xl border border-amber-400/20 bg-amber-400/[0.045] p-3.5 sm:p-4">
            {result?.taskTitle && result.targetEmployeeName ? (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100"><ShieldCheck className="h-4 w-4 text-amber-300" aria-hidden="true" /> Reassignment request</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  Request to move <span className="font-medium text-slate-100">{result.taskTitle}</span> to <span className="font-medium text-slate-100">{result.targetEmployeeName}</span>.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  {status === 'Pending approval' && 'This high-risk change is waiting for an authorized manager or admin. The task has not been reassigned yet.'}
                  {status === 'Approved' && 'The request was approved. Check the task to confirm its current assignment.'}
                  {status === 'Rejected' && 'The request was rejected; the task assignment was not changed.'}
                  {status === 'Execution failed' && 'Approval was recorded, but reassignment did not complete. Review the approval request for next steps.'}
                  {status === 'Completed' && 'The approved reassignment completed.'}
                  {status === 'Executing' && 'The approved request is being executed.'}
                  {!['Pending approval', 'Approved', 'Rejected', 'Execution failed', 'Completed', 'Executing'].includes(status) && 'Manager or admin approval is required before this high-risk change can proceed.'}
                </p>
                {status === 'Pending approval' && <Link to="/approvals" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-200 transition-colors hover:text-amber-100">View approval requests <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
              </>
            ) : (
              <p className="text-sm text-slate-300">The workflow returned no reassignment details. No assignment was changed directly by the assistant.</p>
            )}
          </section>
        )}

        {result && (
          <details className="mt-3 border-t border-slate-800 pt-2.5">
            <summary className="w-fit cursor-pointer select-none text-xs font-medium text-slate-500 transition-colors hover:text-slate-300">Technical details</summary>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400"><span>Tool: <code className="text-slate-300">{item.tool}</code></span><span>Workflow: <code className="text-slate-300">{item._id}</code></span>{result.snapshotCaptured && <span>Pre-change snapshot captured</span>}</div>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-300">{JSON.stringify(result, null, 2)}</pre>
          </details>
        )}
      </div>
    </article>
  );
}

export default function AgentWorkflowPage() {
  const [request, setRequest] = useState('');
  const [items, setItems] = useState<Workflow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [draftTurn, setDraftTurn] = useState<DraftTurn | null>(null);
  const [activeStream, setActiveStream] = useState<ActiveStream | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setHistoryError('');
    try {
      const { data } = await apiClient.get('/agent-workflows');
      setItems(data.data.workflows);
    } catch {
      setHistoryError('Workflow history could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (loading) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    bottomRef.current?.scrollIntoView({ behavior: reducedMotion || activeStream?.phase !== undefined ? 'auto' : 'smooth', block: 'end' });
  }, [items.length, loading, draftTurn?.error, activeStream?.phase, activeStream?.rationale]);

  async function runRequest(rawRequest: string) {
    const submittedRequest = rawRequest.trim();
    if (!submittedRequest || busy) return;
    setBusy(true);
    setDraftTurn({ request: submittedRequest });
    setActiveStream({ phase: 'planning', rationale: '' });

    try {
      let streamState: ActiveStream = { phase: 'planning', rationale: '' };
      const completed = { workflow: null as Workflow | null };
      await streamAgentWorkflow(submittedRequest, (event: AgentStreamEvent) => {
        if (event.type === 'phase') {
          streamState = { ...streamState, phase: event.phase };
          setActiveStream(streamState);
        } else if (event.type === 'text') {
          streamState = { ...streamState, rationale: `${streamState.rationale}${event.text}` };
          setActiveStream(streamState);
        } else if (event.type === 'workflow') {
          completed.workflow = event.workflow as unknown as Workflow;
        }
      });
      if (!completed.workflow) throw new Error('The workflow completed without a result. Please try again.');
      setItems((current) => [completed.workflow as Workflow, ...current]);
      setRequest('');
      setDraftTurn(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The request could not be completed. Check provider availability and supported actions, then try again.';
      setDraftTurn({ request: submittedRequest, error: message });
      setActiveStream(null);
    } finally {
      setBusy(false);
      setActiveStream(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void runRequest(request);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  function applyExample(prompt: string) {
    setRequest(prompt);
    inputRef.current?.focus();
  }

  const conversationItems = useMemo(() => [...items].reverse(), [items]);
  const hasConversation = conversationItems.length > 0 || draftTurn !== null || activeStream !== null;

  return (
    <div className="agent-workspace flex min-w-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/90 px-4 py-3 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size="sm" />
          <div className="min-w-0"><h1 className="truncate text-sm font-semibold text-slate-100 sm:text-base">FlowPilot Assistant</h1><p className="truncate text-xs text-slate-500">Safe, role-scoped task workflows</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{items.length} saved {items.length === 1 ? 'run' : 'runs'}</span>
          <button type="button" aria-label="Refresh workflow history" onClick={() => { setLoading(true); void load(); }} disabled={loading} className="ml-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50">
            <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="agent-thread min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-7">
        <div className="agent-thread-content mx-auto flex min-h-full w-full max-w-4xl flex-col py-6 sm:py-9">
          {!hasConversation && !loading && !historyError && (
            <section className="my-auto flex flex-col items-center justify-center py-10 text-center" aria-labelledby="agent-welcome-title">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/15 bg-amber-400/[0.07] text-amber-200"><Sparkles className="h-6 w-6" aria-hidden="true" /></div>
              <h2 id="agent-welcome-title" className="max-w-xl text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">How can I help with your work today?</h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-400">I can find overdue tasks in your permitted scope or prepare a task reassignment request for manager or admin approval.</p>
              <div className="mt-7 flex max-w-2xl flex-wrap justify-center gap-2">
                {examples.map((example, index) => (
                  <button key={example} type="button" onClick={() => applyExample(example)} className="agent-message-enter rounded-xl border border-slate-700/80 bg-panel/70 px-3.5 py-2.5 text-left text-xs text-slate-300 transition-all hover:-translate-y-0.5 hover:border-amber-400/30 hover:bg-raised hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 sm:text-sm" style={{ animationDelay: `${index * 45}ms` }}>
                    {example}
                  </button>
                ))}
              </div>
              <p className="mt-6 flex items-center gap-1.5 text-[11px] text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-amber-300/80" aria-hidden="true" /> Risky changes are never applied without approval.</p>
            </section>
          )}

          {loading && items.length === 0 && <div className="my-auto flex items-center justify-center gap-2 py-10 text-sm text-slate-400" role="status"><LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />Loading saved workflow runs…</div>}

          {historyError && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-500/[0.06] px-4 py-3" role="alert">
              <span className="flex items-center gap-2 text-sm text-rose-200"><CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />{historyError}</span>
              <Button size="sm" variant="secondary" onClick={() => { setLoading(true); void load(); }}>Retry</Button>
            </div>
          )}

          {conversationItems.map((item) => (
            <div key={item._id} className="mb-10 space-y-6 sm:mb-12 sm:space-y-7">
              <article className="agent-message-enter flex justify-end" aria-label="Your request">
                <div className="max-w-[94%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-brand-400/20 bg-brand-500/[0.09] px-4 py-3.5 text-sm leading-relaxed text-slate-100 sm:max-w-[78%] sm:px-5">{item.request}</div>
              </article>
              <WorkflowResponse item={item} />
            </div>
          ))}

          {draftTurn && (
            <div className="mb-8 space-y-5">
              <article className="agent-message-enter flex justify-end" aria-label="Your request">
                <div className="max-w-[94%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-brand-400/20 bg-brand-500/[0.09] px-4 py-3.5 text-sm leading-relaxed text-slate-100 sm:max-w-[78%] sm:px-5">{draftTurn.request}</div>
              </article>
              {activeStream ? (
                <article className="agent-message-enter flex gap-3 sm:gap-4" aria-live="polite" aria-busy="true">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/[0.08] text-amber-200"><Activity className="h-4 w-4" aria-hidden="true" /></div>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-100"><span className="fp-activity-indicator inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />{phaseLabels[activeStream.phase]}</div>
                    <p className="mt-1 text-xs text-slate-500">Using the existing authorized workflow tools</p>
                    {activeStream.rationale && <div className="mt-3"><MarkdownContent content={activeStream.rationale} /><span aria-label="Response is streaming" className="ml-1 inline-block h-4 w-1 animate-pulse bg-amber-400 align-middle" /></div>}
                  </div>
                </article>
              ) : draftTurn.error ? (
                <article className="agent-message-enter flex gap-3 sm:gap-4" aria-label="FlowPilot error">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-500/[0.08] text-rose-200"><CircleAlert className="h-4 w-4" aria-hidden="true" /></div>
                  <div className="pt-1"><p className="text-sm font-medium text-rose-200">I couldn’t complete that request.</p><p className="mt-1 text-sm leading-relaxed text-slate-400">{draftTurn.error}</p><p className="mt-2 text-xs text-slate-500">Your draft is still in the composer, so you can revise it or try again.</p></div>
                </article>
              ) : null}
            </div>
          )}

          <div ref={bottomRef} className="h-px shrink-0" aria-hidden="true" />
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-800/70 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-4">
        <form ref={formRef} onSubmit={submit} className="agent-composer mx-auto w-full max-w-4xl rounded-2xl border border-slate-700 bg-panel/95 p-2.5 transition-colors focus-within:border-amber-400/40 sm:rounded-[1.35rem] sm:p-3">
          <label className="sr-only" htmlFor="agent-request">Message FlowPilot</label>
          <textarea
            ref={inputRef}
            id="agent-request"
            value={request}
            onChange={(event) => setRequest(event.target.value.slice(0, 1000))}
            onKeyDown={handleComposerKeyDown}
            maxLength={1000}
            rows={2}
            required
            disabled={busy}
            placeholder="Ask FlowPilot to find overdue work or prepare a reassignment request…"
            className="max-h-40 min-h-[3.5rem] w-full resize-y border-0 bg-transparent px-2 py-2 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-0 focus:outline-none focus:ring-0 disabled:opacity-60 sm:min-h-16 sm:px-3"
          />
          <div className="flex items-center justify-between gap-3 px-1 pb-0.5 sm:px-1.5">
            <p className="hidden text-[11px] text-slate-500 sm:block">Enter to send · Shift+Enter for a new line</p>
            <p className="text-[10px] text-slate-600 sm:hidden">Role-scoped · Approval-gated</p>
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] text-slate-600 sm:inline">{request.length}/1000</span>
              <Button type="submit" size="sm" variant="primary" disabled={busy || !request.trim()} aria-label="Send message" className="h-9 w-9 rounded-xl p-0">
                {busy ? <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </form>
        <p className="mx-auto mt-2 max-w-3xl px-2 text-center text-[10px] leading-relaxed text-slate-600">Overdue lookups are read-only. Reassignment requests are high risk and require manager/admin approval.</p>
      </div>
    </div>
  );
}
