import { FormEvent, useState } from 'react';
import { Alert, Button, Field, Input, Modal } from '@/components/ui';
import { parseApiError } from '@/services/errorHelpers';
import { toast } from '@/store/toastStore';
import { updateEmployee } from './employeesApi';
import { Employee } from './types';

interface EditEmployeeModalProps {
  employee: Employee;
  onClose: () => void;
  onUpdated: (employee: Employee) => void;
}

export default function EditEmployeeModal({ employee, onClose, onUpdated }: EditEmployeeModalProps) {
  const [values, setValues] = useState({
    department: employee.department,
    designation: employee.designation,
    phone: employee.phone ?? '',
    joinedAt: employee.joinedAt?.slice(0, 10) ?? '',
    skills: employee.skills?.join(', ') ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const found: Record<string, string> = {};
    if (!values.department.trim()) found.department = 'Department is required.';
    if (!values.designation.trim()) found.designation = 'Designation is required.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    try {
      const updated = await updateEmployee(employee._id, {
        department: values.department.trim(),
        designation: values.designation.trim(),
        phone: values.phone.trim(),
        joinedAt: values.joinedAt || undefined,
        skills: values.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      toast.success('Employee updated.');
      onUpdated(updated);
    } catch (err) {
      const parsed = parseApiError(err, 'Could not update the employee.');
      if (parsed.status === 422) setErrors(parsed.fieldErrors);
      setFormError(parsed.status === 422 ? 'Please fix the highlighted fields.' : parsed.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit ${employee.employeeId}`} onClose={onClose}>
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department" required error={errors.department}>
            {(c) => <Input {...c} value={values.department} onChange={set('department')} />}
          </Field>
          <Field label="Designation" required error={errors.designation}>
            {(c) => <Input {...c} value={values.designation} onChange={set('designation')} />}
          </Field>
          <Field label="Phone" error={errors.phone}>
            {(c) => <Input {...c} type="tel" value={values.phone} onChange={set('phone')} />}
          </Field>
          <Field label="Joining date" error={errors.joinedAt}>
            {(c) => <Input {...c} type="date" value={values.joinedAt} onChange={set('joinedAt')} />}
          </Field>
        </div>
        <Field label="Skills" error={errors.skills} hint="Comma-separated, e.g. Unity, C#, Level design.">
          {(c) => <Input {...c} value={values.skills} onChange={set('skills')} />}
        </Field>
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
