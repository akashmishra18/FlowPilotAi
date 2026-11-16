import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { Alert, Avatar, Badge, Button, EmptyState, Input, PageHeader, Pagination, SearchInput, Select, Skeleton } from '@/components/ui';
import RoleGate from '@/components/RoleGate';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { listEmployees } from '@/features/employees/employeesApi';
import { Employee } from '@/features/employees/types';
import CreateEmployeeModal from '@/features/employees/CreateEmployeeModal';

const PAGE_SIZE = 10;

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? 'success' : 'neutral'} dot>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

function EmployeeRows({ employees }: { employees: Employee[] }) {
  return (
    <>
      <div className="fp-table-shell hidden lg:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Employees</caption>
          <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Employee</th>
              <th scope="col" className="px-4 py-3 font-medium">ID</th>
              <th scope="col" className="px-4 py-3 font-medium">Department</th>
              <th scope="col" className="px-4 py-3 font-medium">Designation</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {employees.map((emp) => (
              <tr key={emp._id} className="hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <Link to={`/employees/${emp._id}`} className="flex items-center gap-3">
                    <Avatar name={emp.user?.name ?? emp.employeeId} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-100 hover:text-brand-300">{emp.user?.name ?? '—'}</span>
                      <span className="block truncate text-xs text-slate-400">{emp.user?.email}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-300">{emp.employeeId}</td>
                <td className="px-4 py-3 text-slate-300">{emp.department}</td>
                <td className="px-4 py-3 text-slate-300">{emp.designation}</td>
                <td className="px-4 py-3"><StatusBadge active={emp.isActive} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="fp-stagger space-y-3 lg:hidden">
        {employees.map((emp) => (
          <li key={emp._id}>
            <Link to={`/employees/${emp._id}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-panel p-4 hover:border-white/20">
              <Avatar name={emp.user?.name ?? emp.employeeId} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-100">{emp.user?.name ?? emp.employeeId}</span>
                <span className="block truncate text-xs text-slate-400">
                  {emp.employeeId} · {emp.designation}
                </span>
              </span>
              <StatusBadge active={emp.isActive} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function EmployeesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const debouncedDepartment = useDebouncedValue(department.trim(), 350);

  const fetcher = useCallback(
    () =>
      listEmployees({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        department: debouncedDepartment || undefined,
        isActive: status === '' ? undefined : status === 'true',
      }),
    [page, debouncedSearch, debouncedDepartment, status],
  );
  const { data, error, isLoading, isInitialLoading, reload } = useAsyncData(fetcher, 'Could not load employees.');
  const hasFilters = Boolean(debouncedSearch || debouncedDepartment || status);

  return (
    <div>
      <PageHeader
        title="Employees"
        description={data ? `${data.pagination.total} total` : 'People and roles in your organization.'}
        actions={
          <RoleGate allow={['ADMIN']}>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add employee
            </Button>
          </RoleGate>
        }
      />

      <form role="search" aria-label="Filter employees" onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-3 sm:grid-cols-3">
        <SearchInput
          aria-label="Search employees"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Search name, email or employee ID"
        />
        <Input
          aria-label="Filter by department"
          value={department}
          onChange={(e) => {
            setPage(1);
            setDepartment(e.target.value);
          }}
          placeholder="Department"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </form>

      {error && (
        <Alert
          tone="error"
          title="Couldn't load employees"
          className="mb-4"
          action={
            <Button size="sm" onClick={() => void reload()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {isInitialLoading && !data ? (
        <div role="status" aria-busy="true" aria-label="Loading employees" className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : data && data.employees.length > 0 ? (
        <div aria-busy={isLoading} className={isLoading ? 'opacity-60 transition-opacity' : undefined}>
          <EmployeeRows employees={data.employees} />
          <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} onChange={setPage} />
        </div>
      ) : !error && data ? (
        <EmptyState
          icon={Users}
          title={hasFilters ? 'No employees match your filters' : 'No employees yet'}
          description={hasFilters ? 'Try a different search or clear the filters.' : 'Add an employee by linking an existing user account. Accounts must be created before they can appear here.'}
          action={!hasFilters && <RoleGate allow={['ADMIN']}><Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>Add first employee</Button></RoleGate>}
        />
      ) : null}

      {showCreate && (
        <CreateEmployeeModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}
