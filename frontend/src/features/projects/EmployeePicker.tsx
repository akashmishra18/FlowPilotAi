import { useEffect, useState } from 'react';
import { Plus, LoaderCircle } from 'lucide-react';
import { Alert, Button, SearchInput } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { listEmployees } from '@/features/employees/employeesApi';
import { Employee } from '@/features/employees/types';

interface EmployeePickerProps {
  excludeIds: string[];
  onPick: (employee: Employee) => void;
}

/**
 * Searches active employees via the existing GET /api/employees endpoint
 * (no new backend surface). Only active employees are offered, matching
 * the backend rule that inactive employees cannot be added as members.
 */
export default function EmployeePicker({ excludeIds, onPick }: EmployeePickerProps) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 300);
  const [results, setResults] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(false);
    setResults([]);
    listEmployees({ search: debounced || undefined, isActive: true, limit: 8 })
      .then((res) => !cancelled && setResults(res.employees))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, attempt]);

  const filtered = results.filter((e) => !excludeIds.includes(e._id));

  return (
    <div>
      <SearchInput aria-label="Search active employees" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search active employees by name or ID" />
      {error && <Alert tone="error" className="mt-2" action={<Button size="sm" variant="ghost" onClick={() => setAttempt((value) => value + 1)}>Retry</Button>}>Could not load active employees.</Alert>}
      <ul className="mt-2 max-h-44 divide-y divide-white/5 overflow-y-auto rounded-lg border border-white/10" aria-busy={isLoading}>
        {isLoading ? (
          <li className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
            <LoaderCircle className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> Searching…
          </li>
        ) : error ? null : filtered.length === 0 ? (
          <li className="py-4 text-center text-xs text-slate-400">No matching active employees.</li>
        ) : (
          filtered.map((employee) => (
            <li key={employee._id}>
              <button type="button" onClick={() => onPick(employee)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5">
                <span>
                  <span className="block text-slate-100">{employee.user?.name ?? employee.employeeId}</span>
                  <span className="block text-xs text-slate-400">
                    {employee.employeeId} · {employee.designation}
                  </span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
