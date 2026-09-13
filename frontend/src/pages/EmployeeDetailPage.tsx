import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LoaderCircle, Pencil, Power } from 'lucide-react';
import RoleGate from '@/components/RoleGate';
import { getEmployeeById, updateEmployeeStatus } from '@/features/employees/employeesApi';
import { Employee } from '@/features/employees/types';
import EditEmployeeModal from '@/features/employees/EditEmployeeModal';
import { getFriendlyErrorMessage } from '@/services/errorHelpers';

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const fetchEmployee = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getEmployeeById(id);
      setEmployee(result);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Could not load this employee.'));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  async function handleToggleStatus() {
    if (!employee) return;
    setIsTogglingStatus(true);
    try {
      const updated = await updateEmployeeStatus(employee._id, !employee.isActive);
      setEmployee(updated);
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsTogglingStatus(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm gap-2">
        <LoaderCircle className="w-4 h-4 animate-spin" /> Loading employee...
      </div>
    );
  }

  if (error && !employee) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button onClick={() => navigate('/employees')} className="text-sm text-gray-500 flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Employees
        </button>
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
      </div>
    );
  }

  if (!employee) return null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <button onClick={() => navigate('/employees')} className="text-sm text-gray-500 flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Employees
      </button>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-4 py-2.5">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{employee.user?.name ?? employee.employeeId}</h2>
            <p className="text-sm text-gray-500">{employee.user?.email}</p>
          </div>
          <span
            className={
              employee.isActive
                ? 'inline-block px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700'
                : 'inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500'
            }
          >
            {employee.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm mb-6">
          <Detail label="Employee ID" value={employee.employeeId} />
          <Detail label="Department" value={employee.department} />
          <Detail label="Designation" value={employee.designation} />
          <Detail label="Phone" value={employee.phone ?? '—'} />
          <Detail label="Joined" value={new Date(employee.joinedAt).toLocaleDateString()} />
          <Detail label="Role" value={employee.user?.role ?? '—'} />
          <Detail label="Skills" value={employee.skills?.length ? employee.skills.join(', ') : '—'} />
        </dl>

        <div className="flex gap-2">
          <RoleGate allow={['ADMIN', 'MANAGER']}>
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>
          </RoleGate>
          <RoleGate allow={['ADMIN']}>
            <button
              onClick={handleToggleStatus}
              disabled={isTogglingStatus}
              className={
                employee.isActive
                  ? 'flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-60'
                  : 'flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-60'
              }
            >
              {isTogglingStatus ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              {employee.isActive ? 'Deactivate' : 'Activate'}
            </button>
          </RoleGate>
        </div>
      </div>

      {showEditModal && (
        <EditEmployeeModal
          employee={employee}
          onClose={() => setShowEditModal(false)}
          onUpdated={(updated) => {
            setEmployee((prev) => (prev ? { ...prev, ...updated } : updated));
            setShowEditModal(false);
          }}
        />
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-400 text-xs mb-0.5">{label}</dt>
      <dd className="text-gray-900 font-medium">{value}</dd>
    </div>
  );
}
