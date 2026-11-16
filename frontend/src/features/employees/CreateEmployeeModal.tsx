import { FormEvent, useState } from 'react';
import { Alert, Button, Field, Input, Modal } from '@/components/ui';
import { parseApiError } from '@/services/errorHelpers';
import { toast } from '@/store/toastStore';
import { createEmployee } from './employeesApi';
import { Employee } from './types';

interface CreateEmployeeModalProps {
  onClose: () => void;
  onCreated: (employee: Employee) => void;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export default function CreateEmployeeModal({ onClose, onCreated }: CreateEmployeeModalProps) {
  const [values, setValues] = useState({ userId: '', employeeId: '', department: '', designation: '', phone: '', joinedAt: '' });
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
    if (!OBJECT_ID.test(values.userId.trim())) found.userId = 'Enter the account ID shown in your account-provisioning records.';
    if (!values.employeeId.trim()) found.employeeId = 'Employee ID is required.';
    if (!values.department.trim()) found.department = 'Department is required.';
    if (!values.designation.trim()) found.designation = 'Designation is required.';
    if (!values.joinedAt) found.joinedAt = 'Joining date is required.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    try {
      const employee = await createEmployee({
        userId: values.userId.trim(),
        employeeId: values.employeeId.trim(),
        department: values.department.trim(),
        designation: values.designation.trim(),
        phone: values.phone.trim() || undefined,
        joinedAt: values.joinedAt,
      });
      toast.success('Employee created.');
      onCreated(employee);
    } catch (err) {
      const parsed = parseApiError(err, 'Could not create the employee.');
      if (parsed.status === 422) setErrors(parsed.fieldErrors);
      setFormError(parsed.status === 422 ? 'Please fix the highlighted fields.' : parsed.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Add employee" description="Link an employee record to an existing user account." onClose={onClose}>
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <Alert tone="info" className="mb-4">
        An employee record must link to an existing user account. This form cannot search for or create accounts. If you cannot find the account ID in your account-provisioning records, ask your system administrator for help.
      </Alert>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Existing account ID" required error={errors.userId} hint="Use the account's 24-character system ID, not an email address or employee code.">
          {(c) => <Input {...c} value={values.userId} onChange={set('userId')} placeholder="Paste the existing account ID" className="font-mono" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee ID" required error={errors.employeeId}>
            {(c) => <Input {...c} value={values.employeeId} onChange={set('employeeId')} placeholder="FP-0001" />}
          </Field>
          <Field label="Joining date" required error={errors.joinedAt}>
            {(c) => <Input {...c} type="date" value={values.joinedAt} onChange={set('joinedAt')} />}
          </Field>
          <Field label="Department" required error={errors.department}>
            {(c) => <Input {...c} value={values.department} onChange={set('department')} placeholder="Engineering" />}
          </Field>
          <Field label="Designation" required error={errors.designation}>
            {(c) => <Input {...c} value={values.designation} onChange={set('designation')} placeholder="Game Programmer" />}
          </Field>
        </div>
        <Field label="Phone" error={errors.phone}>
          {(c) => <Input {...c} type="tel" value={values.phone} onChange={set('phone')} />}
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Create employee
          </Button>
        </div>
      </form>
    </Modal>
  );
}
