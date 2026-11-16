import { useCallback, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Alert, Button, Card, CardHeading, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { AIUsagePeriod, getAIUsageAnalytics } from '@/features/ai/aiUsageApi';
import { useAsyncData } from '@/hooks/useAsyncData';
import { parseApiError } from '@/services/errorHelpers';

const PERIOD_LABEL: Record<AIUsagePeriod, string> = { daily: 'Daily · last 30 days', weekly: 'Weekly · last 12 weeks', monthly: 'Monthly · last 12 months' };
const formatCount = (value: number | null) => value === null ? 'Unavailable' : new Intl.NumberFormat().format(value);
const formatCost = (value: number | null) => value === null ? 'Unavailable' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(value);

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-sm font-medium text-slate-500">{label}</p>
    <p className="fp-metric-value mt-2 break-words text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
  </div>;
}

export default function AIUsagePage() {
  const [period, setPeriod] = useState<AIUsagePeriod>('daily');
  const fetchUsage = useCallback(() => getAIUsageAnalytics(period), [period]);
  const { data, error, isInitialLoading, isLoading, reload } = useAsyncData(fetchUsage, 'Unable to load AI usage.');

  return <div>
    <PageHeader
      title="AI Usage & Cost"
      description={`Provider-reported tokens and estimated API cost · ${PERIOD_LABEL[period]}. Costs use maintained public standard rates where supported.`}
      actions={<div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="usage-period">Usage period</label>
        <select id="usage-period" value={period} onChange={(event) => setPeriod(event.target.value as AIUsagePeriod)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
          <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
        </select>
        <Button variant="secondary" size="sm" onClick={() => void reload()} isLoading={isLoading && !isInitialLoading}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh</Button>
      </div>}
    />

    {error && <Alert tone="error" title="Usage unavailable" className="mb-5" action={<Button variant="ghost" size="sm" onClick={() => void reload()}>Try again</Button>}>{parseApiError(error, 'The usage service could not return analytics.').message}</Alert>}
    {isInitialLoading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28" />)}</div>}

    {!isInitialLoading && data && <>
      <section aria-label="Usage totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total tokens" value={formatCount(data.summary.totalTokens)} />
        <Metric label="Input tokens" value={formatCount(data.summary.promptTokens)} />
        <Metric label="Output tokens" value={formatCount(data.summary.completionTokens)} />
        <Metric label="Estimated API cost" value={formatCost(data.summary.estimatedCostUsd)} />
      </section>
      <p className="mt-3 text-xs text-slate-500">Request count: {formatCount(data.summary.requestCount)}. “Unavailable” means the provider did not return usage or the model has no maintained price entry; it is not zero.</p>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <Card>
          <CardHeading title="Usage trend" description={`UTC buckets · ${PERIOD_LABEL[period]}`} />
          {data.trend.length === 0 ? <EmptyState icon={Activity} title="No provider usage yet" description="AI usage appears here after a provider returns a response." /> :
            <div className="fp-chart-enter h-72 w-full" role="img" aria-label="Chart of input and output token usage over time">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#29384d" />
                  <XAxis dataKey="date" tick={{ fill: '#9babc1', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#3b4c64' }} />
                  <YAxis tick={{ fill: '#9babc1', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Legend verticalAlign="bottom" height={28} iconType="plainline" wrapperStyle={{ color: '#a5b3c8', fontSize: 12 }} />
                  <Tooltip formatter={(value: unknown) => value === null || value === undefined ? 'Unavailable' : formatCount(Number(value))} contentStyle={{ borderRadius: 10, borderColor: '#3b4c64', backgroundColor: '#172437', color: '#edf3fc' }} />
                  <Line type="monotone" dataKey="promptTokens" name="Input tokens" stroke="#5f86f5" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive animationDuration={650} animationEasing="ease-out" />
                  <Line type="monotone" dataKey="completionTokens" name="Output tokens" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive animationDuration={750} animationEasing="ease-out" />
                </LineChart>
              </ResponsiveContainer>
            </div>}
        </Card>
        <Card>
          <CardHeading title="Provider and model" description="Observed provider responses and estimated costs." />
          {data.providerModels.length === 0 ? <p className="text-sm text-slate-500">No provider usage in this period.</p> : <div className="space-y-3">
            {data.providerModels.map((item) => <div key={`${item.provider}-${item.model}`} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-slate-900">{item.model}</p><p className="text-xs text-slate-500">{item.provider} · {formatCount(item.requestCount)} request(s)</p></div><p className="text-sm font-semibold text-slate-800">{formatCost(item.estimatedCostUsd)}</p></div>
              <p className="mt-2 text-xs text-slate-600">{formatCount(item.promptTokens)} input · {formatCount(item.completionTokens)} output</p>
            </div>)}
          </div>}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeading title="People in your reporting scope" description="Usage visibility follows your account role and reporting relationships." />
        {data.users.length === 0 ? <p className="text-sm text-slate-500">No users are in scope for this report.</p> : <div className="fp-table-shell">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3 pr-4">Person</th><th className="py-3 pr-4">Role</th><th className="py-3 pr-4">Requests</th><th className="py-3 pr-4">Tokens</th><th className="py-3">Estimated cost</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{data.users.map((person) => <tr key={person.userId}><td className="py-3 pr-4 font-medium text-slate-900">{person.name}</td><td className="py-3 pr-4 text-slate-600">{person.role.replace('_', ' ')}</td><td className="py-3 pr-4 text-slate-700">{formatCount(person.requestCount)}</td><td className="py-3 pr-4 text-slate-700">{formatCount(person.totalTokens)}</td><td className="py-3 text-slate-700">{formatCost(person.estimatedCostUsd)}</td></tr>)}</tbody>
          </table>
        </div>}
      </Card>
    </>}
  </div>;
}
