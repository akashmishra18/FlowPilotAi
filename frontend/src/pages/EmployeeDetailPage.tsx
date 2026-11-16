import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock, Pencil, Power, SearchX } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Skeleton, buttonClasses } from '@/components/ui';
import RoleGate from '@/components/RoleGate';
import { useAsyncData } from '@/hooks/useAsyncData';
import { getEmployeeById, updateEmployeeStatus } from '@/features/employees/employeesApi';
import EditEmployeeModal from '@/features/employees/EditEmployeeModal';
import { parseApiError } from '@/services/errorHelpers';
import { toast } from '@/store/toastStore';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-100">{value}</dd>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const fetcher = useCallback(() => getEmployeeById(id), [id]);
  const { data: employee, error, errorStatus, isInitialLoading, reload } = useAsyncData(fetcher, 'Could not load this employee.');

  const [showEdit, setShowEdit] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleToggleStatus() {
    if (!employee) return;
    setIsBusy(true);
    setActionError(null);
    try {
      await updateEmployeeStatus(employee._id, !employee.isActive);
      toast.success(employee.isActive ? 'Employee deactivated.' : 'Employee activated.');
      setConfirmStatus(false);
      // The status endpoint returns the unpopulated record, so refetch to keep the user details.
      await reload();
    } catch (err) {
      setConfirmStatus(false);
      setActionError(parseApiError(err, 'Could not change the status.').message);
    } finally {
      setIsBusy(false);
    }
  }

  const back = (
    <Link to="/employees" className={buttonClasses({ variant: 'secondary' })}>
      Back to employees
    </Link>
  );

  if (isInitialLoading && !employee) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading employee">
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!employee) {
    if (errorStatus === 404) return <EmptyState icon={SearchX} title="Employee not found" action={back} />;
    if (errorStatus === 403) return <EmptyState icon={Lock} title="You don't have access to this employee" action={back} />;
    return (
      <Alert
        tone="error"
        title="Couldn't load this employee"
        action={
          <Button size="sm" onClick={() => void reload()}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  const name = employee.user?.name ?? employee.employeeId;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ to: '/employees', label: 'Back to employees' }}
        title={name}
        description={employee.user?.email}
        badge={
          <Badge tone={employee.isActive ? 'success' : 'neutral'} dot>
            {employee.isActive ? 'Active' : 'Inactive'}
          </Badge>
        }
      />

      {actionError && (
        <Alert tone="error" className="mb-4">
          {actionError}
        </Alert>
      )}

      <Card>
        <div className="mb-5 flex items-center gap-3">
          <Avatar name={name} size="lg" />
          <div className="flex-1" />
          <RoleGate allow={['ADMIN', 'MANAGER']}>
            <Button size="sm" onClick={() => setShowEdit(true)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
            </Button>
          </RoleGate>
          <RoleGate allow={['ADMIN']}>
            <Button size="sm" variant={employee.isActive ? 'danger' : 'secondary'} onClick={() => setConfirmStatus(true)}>
              <Power className="h-3.5 w-3.5" aria-hidden="true" /> {employee.isActive ? 'Deactivate' : 'Activate'}
            </Button>
          </RoleGate>
        </div>
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Detail label="Employee ID" value={employee.employeeId} />
          <Detail label="Department" value={employee.department} />
          <Detail label="Designation" value={employee.designation} />
          <Detail label="Phone" value={employee.phone ?? '—'} />
          <Detail label="Joined" value={new Date(employee.joinedAt).toLocaleDateString()} />
          <Detail label="Account role" value={employee.user?.role.replace('_', ' ') ?? '—'} />
          <div className="col-span-2 sm:col-span-3">
            <Detail label="Skills" value={employee.skills?.length ? employee.skills.join(', ') : '—'} />
          </div>
        </dl>
      </Card>

      {showEdit && (
        <EditEmployeeModal
          employee={employee}
          onClose={() => setShowEdit(false)}
          onUpdated={() => {
            setShowEdit(false);
            void reload();
          }}
        />
      )}

      {confirmStatus && (
        <ConfirmDialog
          title={employee.isActive ? 'Deactivate this employee?' : 'Activate this employee?'}
          message={
            employee.isActive
              ? `${name} will be marked inactive and their user account will no longer be able to sign in.`
              : `${name} will be marked active and their user account will be able to sign in again.`
          }
          confirmLabel={employee.isActive ? 'Deactivate' : 'Activate'}
          tone={employee.isActive ? 'danger' : 'primary'}
          isLoading={isBusy}
          onConfirm={() => void handleToggleStatus()}
          onCancel={() => setConfirmStatus(false)}
        />
      )}
    </div>
  );
}
