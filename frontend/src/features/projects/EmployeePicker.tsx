import { useEffect, useState } from 'react';
import { Search, Plus, LoaderCircle } from 'lucide-react';
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
  const [results, setResults] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(true);
      listEmployees({ search: query || undefined, isActive: true, limit: 8 })
        .then((res) => setResults(res.employees))
        .catch(() => setResults([]))
        .finally(() => setIsLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const filtered = results.filter((e) => !excludeIds.includes(e._id));

  return (
    <div>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search active employees by name or ID"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
        />
      </div>

      <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-500">
            <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Searching...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">No matching active employees.</div>
        ) : (
          filtered.map((employee) => (
            <button
              key={employee._id}
              type="button"
              onClick={() => onPick(employee)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              <span className="text-left">
                <span className="block text-slate-200">{employee.user?.name ?? employee.employeeId}</span>
                <span className="block text-xs text-slate-500">
                  {employee.employeeId} · {employee.designation}
                </span>
              </span>
              <Plus className="w-4 h-4 text-slate-500 shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
