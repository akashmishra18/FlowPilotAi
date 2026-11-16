import { useCallback } from 'react';
import { UserX } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { useAsyncData } from '@/hooks/useAsyncData';
import { getMyEmployeeProfile } from '@/features/employees/employeesApi';
import { useAuthStore } from '@/store/authStore';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-100">{value}</dd>
    </div>
  );
}

export default function MyProfilePage() {
  const user = useAuthStore((s) => s.user);
  const fetcher = useCallback(() => getMyEmployeeProfile(), []);
  const { data: employee, error, errorStatus, isInitialLoading, reload } = useAsyncData(fetcher, 'Could not load your profile.');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My profile" description="Your account and employee record." />

      <Card className="mb-6 flex items-center gap-4">
        <Avatar name={user?.name ?? '?'} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-50">{user?.name}</p>
          <p className="truncate text-sm text-slate-400">{user?.email}</p>
        </div>
        <Badge tone="violet" className="ml-auto">
          {user?.role.replace('_', ' ')}
        </Badge>
      </Card>

      {isInitialLoading ? (
        <Skeleton className="h-48" />
      ) : errorStatus === 404 ? (
        <EmptyState icon={UserX} title="No employee profile yet" description="An administrator hasn't linked an employee record to your account. Contact them if you expect one." />
      ) : error ? (
        <Alert
          tone="error"
          title="Couldn't load your employee record"
          action={
            <Button size="sm" onClick={() => void reload()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      ) : employee ? (
        <Card>
          <h2 className="text-sm font-semibold text-slate-100">Employee record</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
            <Row label="Employee ID" value={employee.employeeId} />
            <Row label="Department" value={employee.department} />
            <Row label="Designation" value={employee.designation} />
            <Row label="Phone" value={employee.phone ?? '—'} />
            <Row label="Joined" value={new Date(employee.joinedAt).toLocaleDateString()} />
            <Row label="Skills" value={employee.skills?.length ? employee.skills.join(', ') : '—'} />
          </dl>
        </Card>
      ) : null}
    </div>
  );
}
