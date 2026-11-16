import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, SearchInput } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAuthStore } from '@/store/authStore';
import { listEmployees } from '@/features/employees/employeesApi';

interface ManagerOption {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER';
}

interface ManagerPickerProps {
  value: string;
  onChange: (userId: string) => void;
}

/** Uses the existing employee directory's populated user summaries to find active manager accounts. */
export default function ManagerPicker({ value, onChange }: ManagerPickerProps) {
  const currentUser = useAuthStore((state) => state.user);
  const [query, setQuery] = useState('');
  const [selectedOption, setSelectedOption] = useState<ManagerOption | null>(null);
  const [employees, setEmployees] = useState<Awaited<ReturnType<typeof listEmployees>>['employees']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEmployees([]);
    listEmployees({ search: debouncedQuery || undefined, isActive: true, limit: 100 })
      .then((response) => {
        if (!cancelled) setEmployees(response.employees);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load manager accounts. Try again by changing the search or reopening this form.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, loadAttempt]);

  const options = useMemo(() => {
    const linkedAccounts: ManagerOption[] = employees.flatMap((employee) => {
      const account = employee.user;
      if (!employee.isActive || !account?.isActive || (account.role !== 'ADMIN' && account.role !== 'MANAGER')) return [];
      return [{ id: account._id, name: account.name, email: account.email, role: account.role }];
    });
    if (currentUser?.isActive && (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER')) {
      linkedAccounts.push({ id: currentUser._id, name: currentUser.name, email: currentUser.email, role: currentUser.role });
    }
    const unique = Array.from(new Map(linkedAccounts.map((account) => [account.id, account])).values());
    const normalizedQuery = query.trim().toLowerCase();
    return unique.filter((account) => !normalizedQuery || `${account.name} ${account.email} ${account.role}`.toLowerCase().includes(normalizedQuery));
  }, [currentUser, employees, query]);

  const selected = options.find((option) => option.id === value) ?? (selectedOption?.id === value ? selectedOption : undefined);

  return (
    <div className="space-y-2">
      <SearchInput
        aria-label="Search active managers"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name or email"
      />
      {selected && <p className="text-xs text-slate-600">Selected: {selected.name} · {selected.role}</p>}
      {error && <Alert tone="error" action={<Button size="sm" variant="ghost" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</Button>}>{error}</Alert>}
      <ul className="max-h-44 divide-y divide-white/10 overflow-y-auto rounded-lg border border-white/10" aria-busy={loading}>
        {loading ? (
          <li className="px-3 py-3 text-sm text-slate-500">Loading managers…</li>
        ) : options.length === 0 ? (
        <li className="px-3 py-3 text-sm text-slate-500">No matching manager accounts found in the available employee records.</li>
        ) : options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              aria-pressed={value === option.id}
              onClick={() => {
                setSelectedOption(option);
                onChange(option.id);
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-800">{option.name}</span>
                <span className="block truncate text-xs text-slate-500">{option.email} · {option.role}</span>
              </span>
              {value === option.id && <span className="shrink-0 text-xs font-medium text-brand-700">Selected</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
