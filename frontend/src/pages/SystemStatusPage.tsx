import { useCallback } from 'react';
import { Database, RefreshCw, Server, Timer } from 'lucide-react';
import { Alert, Badge, Button, Card, PageHeader, Skeleton } from '@/components/ui';
import { useAsyncData } from '@/hooks/useAsyncData';
import { apiClient } from '@/services/apiClient';

interface HealthResponse {
  success: boolean;
  message: string;
  timestamp: string;
  database: string;
}

interface HealthResult extends HealthResponse {
  /** Measured in the browser around the real request. */
  latencyMs: number;
}

export default function SystemStatusPage() {
  const fetcher = useCallback(async (): Promise<HealthResult> => {
    const started = performance.now();
    const res = await apiClient.get<HealthResponse>('/health');
    return { ...res.data, latencyMs: Math.round(performance.now() - started) };
  }, []);
  const { data, error, isLoading, isInitialLoading, reload } = useAsyncData(fetcher, 'Could not reach the backend API.');

  const apiOk = Boolean(data?.success);
  const dbOk = data?.database === 'connected';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        title="System status"
        description="Live response from GET /api/health."
        actions={
          <Button size="sm" onClick={() => void reload()} isLoading={isLoading && !isInitialLoading}>
            {!(isLoading && !isInitialLoading) && <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            Check again
          </Button>
        }
      />

      {error && (
        <Alert tone="error" title="Backend unreachable" className="mb-6">
          {error}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3" aria-busy={isInitialLoading}>
        <Card>
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
            <Server className="h-4 w-4" aria-hidden="true" /> API
          </div>
          {isInitialLoading ? <Skeleton className="h-6 w-24" /> : data ? <Badge tone={apiOk ? 'success' : 'danger'} dot>{apiOk ? 'Operational' : 'Degraded'}</Badge> : <Badge tone="danger" dot>Unreachable</Badge>}
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
            <Database className="h-4 w-4" aria-hidden="true" /> Database
          </div>
          {isInitialLoading ? <Skeleton className="h-6 w-24" /> : data ? <Badge tone={dbOk ? 'success' : 'warning'} dot>{data.database}</Badge> : <span className="text-sm text-slate-400">Not available</span>}
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
            <Timer className="h-4 w-4" aria-hidden="true" /> Response time
          </div>
          {isInitialLoading ? <Skeleton className="h-6 w-16" /> : data ? <span className="text-xl font-semibold text-slate-900">{data.latencyMs} ms</span> : <span className="text-sm text-slate-600">Not available</span>}
        </Card>
      </div>

      {data && (
        <Card className="mt-4">
          <dl className="divide-y divide-white/5 text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-600">Message</dt>
              <dd className="text-slate-800">{data.message}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-600">Server time</dt>
              <dd className="text-slate-800">{new Date(data.timestamp).toLocaleString()}</dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
