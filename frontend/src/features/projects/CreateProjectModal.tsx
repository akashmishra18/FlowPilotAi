import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { Alert, Avatar, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import EmployeePicker from './EmployeePicker';
import ManagerPicker from './ManagerPicker';
import { createProject } from './projectsApi';
import { ProjectPriority } from './types';
import { parseApiError } from '@/services/errorHelpers';
import { toast } from '@/store/toastStore';
import { Employee } from '@/features/employees/types';

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export default function CreateProjectModal({ onClose, onCreated }: CreateProjectModalProps) {
  const [values, setValues] = useState({
    name: '',
    projectCode: '',
    description: '',
    clientName: '',
    priority: 'MEDIUM' as ProjectPriority,
    startDate: '',
    deadline: '',
    managerId: '',
  });
  const [members, setMembers] = useState<Employee[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const found: Record<string, string> = {};
    if (!values.name.trim()) found.name = 'Project name is required.';
    if (!values.projectCode.trim()) found.projectCode = 'Project code is required.';
    if (!values.startDate) found.startDate = 'Start date is required.';
    if (values.deadline && values.startDate && values.deadline < values.startDate) found.deadline = 'End date cannot be before the start date.';
    if (!OBJECT_ID.test(values.managerId.trim())) found.managerId = 'Choose an active project manager.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    try {
      await createProject({
        name: values.name.trim(),
        projectCode: values.projectCode.trim(),
        description: values.description.trim() || undefined,
        clientName: values.clientName.trim() || undefined,
        priority: values.priority,
        startDate: values.startDate,
        deadline: values.deadline || undefined,
        managerId: values.managerId.trim(),
        members: members.map((m) => m._id),
      });
      toast.success('Project created.');
      onCreated();
    } catch (err) {
      const parsed = parseApiError(err, 'Could not create the project.');
      if (parsed.status === 422) setErrors(parsed.fieldErrors);
      setFormError(parsed.status === 422 ? 'Please fix the highlighted fields.' : parsed.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Create project" description="Set up a new project workspace." onClose={onClose} size="lg">
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" required error={errors.name}>
            {(c) => <Input {...c} value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="Space Shooter" />}
          </Field>
          <Field label="Project code" required error={errors.projectCode}>
            {(c) => <Input {...c} value={values.projectCode} onChange={(e) => set('projectCode', e.target.value)} placeholder="FP-01" />}
          </Field>
        </div>
        <Field label="Description" error={errors.description}>
          {(c) => <Textarea {...c} rows={2} value={values.description} onChange={(e) => set('description', e.target.value)} placeholder="What is this project about?" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client name" error={errors.clientName}>
            {(c) => <Input {...c} value={values.clientName} onChange={(e) => set('clientName', e.target.value)} />}
          </Field>
          <Field label="Priority" error={errors.priority}>
            {(c) => (
              <Select {...c} value={values.priority} onChange={(e) => set('priority', e.target.value as ProjectPriority)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            )}
          </Field>
          <Field label="Start date" required error={errors.startDate}>
            {(c) => <Input {...c} type="date" value={values.startDate} onChange={(e) => set('startDate', e.target.value)} />}
          </Field>
          <Field label="End date" error={errors.deadline}>
            {(c) => <Input {...c} type="date" value={values.deadline} onChange={(e) => set('deadline', e.target.value)} />}
          </Field>
        </div>

        <Field label="Project manager" required error={errors.managerId} hint="Choose an active manager/admin account linked to an employee record. The signed-in admin is also available.">
          {() => <ManagerPicker value={values.managerId} onChange={(managerId) => set('managerId', managerId)} />}
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">Members</span>
            <Button size="sm" variant="ghost" onClick={() => setShowPicker((s) => !s)}>
              {showPicker ? 'Close' : 'Add member'}
            </Button>
          </div>
          {members.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {members.map((m) => (
                <li key={m._id} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-2 text-xs text-slate-200">
                  <Avatar name={m.user?.name ?? m.employeeId} size="sm" />
                  {m.user?.name ?? m.employeeId}
                  <button type="button" aria-label={`Remove ${m.user?.name ?? m.employeeId}`} onClick={() => setMembers((prev) => prev.filter((x) => x._id !== m._id))} className="text-slate-400 hover:text-rose-300">
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showPicker && (
            <EmployeePicker
              excludeIds={members.map((m) => m._id)}
              onPick={(employee) => {
                setMembers((prev) => [...prev, employee]);
                setShowPicker(false);
              }}
            />
          )}
          {errors.members && (
            <p role="alert" className="mt-1.5 text-xs text-rose-300">
              {errors.members}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Create project
          </Button>
        </div>
      </form>
    </Modal>
  );
}
