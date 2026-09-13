import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { getMyEmployeeProfile } from '@/features/employees/employeesApi';
import { Employee } from '@/features/employees/types';
import { getFriendlyErrorMessage } from '@/services/errorHelpers';

export default function MyProfilePage() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyEmployeeProfile()
      .then(setEmployee)
      .catch((err) =>
        setError(getFriendlyErrorMessage(err, 'No employee profile has been set up for your account yet.')),
      )
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm gap-2">
        <LoaderCircle className="w-4 h-4 animate-spin" /> Loading your profile...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">My Profile</h2>

      {error && <div className="rounded-lg bg-amber-50 text-amber-700 text-sm px-4 py-3">{error}</div>}

      {employee && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900">{employee.user?.name}</h3>
            <p className="text-sm text-gray-500">{employee.user?.email}</p>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Detail label="Employee ID" value={employee.employeeId} />
            <Detail label="Department" value={employee.department} />
            <Detail label="Designation" value={employee.designation} />
            <Detail label="Phone" value={employee.phone ?? '—'} />
            <Detail label="Joined" value={new Date(employee.joinedAt).toLocaleDateString()} />
            <Detail label="Role" value={employee.user?.role ?? '—'} />
            <Detail label="Skills" value={employee.skills?.length ? employee.skills.join(', ') : '—'} />
          </dl>
        </div>
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
