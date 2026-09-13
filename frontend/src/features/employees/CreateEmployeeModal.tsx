import { FormEvent, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import Modal from '@/components/Modal';
import { createEmployee } from './employeesApi';
import { Employee } from './types';
import { getFriendlyErrorMessage } from '@/services/errorHelpers';

interface CreateEmployeeModalProps {
  onClose: () => void;
  onCreated: (employee: Employee) => void;
}

export default function CreateEmployeeModal({ onClose, onCreated }: CreateEmployeeModalProps) {
  const [userId, setUserId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [joinedAt, setJoinedAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const employee = await createEmployee({
        userId: userId.trim(),
        employeeId: employeeId.trim(),
        department: department.trim(),
        designation: designation.trim(),
        phone: phone.trim() || undefined,
        joinedAt,
      });
      onCreated(employee);
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Add Employee" onClose={onClose}>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-4 py-2.5">{error}</div>}

      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4">
        The employee must already have a user account (created via registration). Enter their user ID below —
        a user search/lookup tool will be added in a later phase.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="User ID">
          <input
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="input"
            placeholder="e.g. 665f1c2e9a1b2c3d4e5f6789"
          />
        </Field>
        <Field label="Employee ID">
          <input
            required
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="input"
            placeholder="FP-0001"
          />
        </Field>
        <Field label="Department">
          <input
            required
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="input"
            placeholder="Engineering"
          />
        </Field>
        <Field label="Designation">
          <input
            required
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            className="input"
            placeholder="Game Programmer"
          />
        </Field>
        <Field label="Phone (optional)">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="+91..." />
        </Field>
        <Field label="Joining Date">
          <input
            required
            type="date"
            value={joinedAt}
            onChange={(e) => setJoinedAt(e.target.value)}
            className="input"
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
            Create Employee
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
