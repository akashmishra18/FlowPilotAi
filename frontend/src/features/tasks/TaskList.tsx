import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui';
import { Task } from './types';
import { TaskPriorityBadge, TaskStatusBadge } from './TaskBadges';
import { assigneeName, formatDueDate, isOverdue } from './ui';
import OverdueReminderButton from './OverdueReminderButton';
import { useAuthStore } from '@/store/authStore';

function DueDate({ task }: { task: Task }) {
  const overdue = isOverdue(task);
  return (
    <span className={overdue ? 'font-medium text-rose-300' : 'text-slate-300'}>
      {formatDueDate(task.dueDate)}
      {overdue && <span className="ml-1.5 text-xs">(overdue)</span>}
    </span>
  );
}

export function TaskListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading tasks" className="space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

/** Table on md+ screens; stacked cards on small screens so nothing needs horizontal scrolling. */
export default function TaskList({ tasks }: { tasks: Task[] }) {
  const canManage = ['ADMIN', 'MANAGER'].includes(useAuthStore((s) => s.user?.role ?? ''));
  return (
    <>
      <div className="fp-table-shell hidden lg:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Tasks</caption>
          <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Task</th>
              <th scope="col" className="px-4 py-3 font-medium">Project</th>
              <th scope="col" className="px-4 py-3 font-medium">Assignee</th>
              <th scope="col" className="px-4 py-3 font-medium">Priority</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Due</th>
              {canManage && <th scope="col" className="px-4 py-3 font-medium">Reminder</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {tasks.map((task) => (
              <tr key={task._id} className="transition-colors hover:bg-white/[0.03]">
                <td className="max-w-xs px-4 py-3">
                  <Link to={`/tasks/${task._id}`} className="font-medium text-slate-100 hover:text-brand-300">
                    {task.title}
                  </Link>
                  {task.tags.length > 0 && <div className="mt-1 truncate text-xs text-slate-400">{task.tags.map((t) => `#${t}`).join('  ')}</div>}
                </td>
                <td className="px-4 py-3 text-slate-300">{task.projectId?.projectCode ?? '—'}</td>
                <td className="px-4 py-3 text-slate-300">{assigneeName(task)}</td>
                <td className="px-4 py-3"><TaskPriorityBadge priority={task.priority} /></td>
                <td className="px-4 py-3"><TaskStatusBadge status={task.status} /></td>
                <td className="whitespace-nowrap px-4 py-3"><DueDate task={task} /></td>
                {canManage && <td className="px-4 py-3">{isOverdue(task) && <OverdueReminderButton taskId={task._id} disabled={!task.assignedTo} />}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="fp-stagger space-y-3 lg:hidden">
        {tasks.map((task) => (
          <li key={task._id}>
            <div className="rounded-xl border border-white/10 bg-panel p-4 transition-colors hover:border-white/20">
            <Link to={`/tasks/${task._id}`} className="block">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-slate-100">{task.title}</span>
                <TaskStatusBadge status={task.status} />
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {task.projectId?.projectCode ?? '—'} · {assigneeName(task)}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <TaskPriorityBadge priority={task.priority} />
                <DueDate task={task} />
              </div>
            </Link>
            {canManage && isOverdue(task) && <div className="mt-3"><OverdueReminderButton taskId={task._id} disabled={!task.assignedTo} /></div>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
