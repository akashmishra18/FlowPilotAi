import { FormEvent, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import Modal from '@/components/Modal';
import { updateEmployee } from './employeesApi';
import { Employee } from './types';
import { getFriendlyErrorMessage } from '@/services/errorHelpers';

interface EditEmployeeModalProps {
  employee: Employee;
  onClose: () => void;
  onUpdated: (employee: Employee) => void;
}

export default function EditEmployeeModal({ employee, onClose, onUpdated }: EditEmployeeModalProps) {
  const [department, setDepartment] = useState(employee.department);
  const [designation, setDesignation] = useState(employee.designation);
  const [phone, setPhone] = useState(employee.phone ?? '');
  const [joinedAt, setJoinedAt] = useState(employee.joinedAt?.slice(0, 10) ?? '');
  const [skills, setSkills] = useState(employee.skills?.join(', ') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const updated = await updateEmployee(employee._id, {
        department: department.trim(),
        designation: designation.trim(),
        phone: phone.trim(),
        joinedAt: joinedAt || undefined,
        skills: skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      onUpdated(updated);
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit ${employee.employeeId}`} onClose={onClose}>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-4 py-2.5">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Department">
          <input required value={department} onChange={(e) => setDepartment(e.target.value)} className="input" />
        </Field>
        <Field label="Designation">
          <input required value={designation} onChange={(e) => setDesignation(e.target.value)} className="input" />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
        </Field>
        <Field label="Joining Date">
          <input type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} className="input" />
        </Field>
        <Field label="Skills (comma-separated)">
          <input
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            className="input"
            placeholder="Unity, C#, Level Design"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 rounded-lg"
          >
            {isSubmitting && <LoaderCircle className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
