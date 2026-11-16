import { FormEvent, useState } from 'react';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { updateProject } from './projectsApi';
import { Project, ProjectPriority } from './types';
import { parseApiError } from '@/services/errorHelpers';
import { toast } from '@/store/toastStore';

interface EditProjectModalProps {
  project: Project;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditProjectModal({ project, onClose, onUpdated }: EditProjectModalProps) {
  const [values, setValues] = useState({
    name: project.name,
    description: project.description,
    clientName: project.clientName,
    priority: project.priority as ProjectPriority,
    startDate: project.startDate.slice(0, 10),
    deadline: project.deadline?.slice(0, 10) ?? '',
  });
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
    if (!values.startDate) found.startDate = 'Start date is required.';
    if (values.deadline && values.startDate && values.deadline < values.startDate) found.deadline = 'End date cannot be before the start date.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    try {
      await updateProject(project._id, {
        name: values.name.trim(),
        description: values.description.trim(),
        clientName: values.clientName.trim(),
        priority: values.priority,
        startDate: values.startDate,
        deadline: values.deadline || undefined,
      });
      toast.success('Project updated.');
      onUpdated();
    } catch (err) {
      const parsed = parseApiError(err, 'Could not update the project.');
      if (parsed.status === 422) setErrors(parsed.fieldErrors);
      setFormError(parsed.status === 422 ? 'Please fix the highlighted fields.' : parsed.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit ${project.projectCode}`} onClose={onClose} size="lg">
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Project name" required error={errors.name}>
          {(c) => <Input {...c} value={values.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field label="Description" error={errors.description}>
          {(c) => <Textarea {...c} rows={2} value={values.description} onChange={(e) => set('description', e.target.value)} />}
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
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
