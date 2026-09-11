import { useEffect, useState } from 'react';
import { apiClient } from '@/services/apiClient';

interface HealthData {
  success: boolean;
  message: string;
  timestamp: string;
  database: string;
}

export default function SystemStatusPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/health')
      .then((res) => setHealth(res.data))
      .catch(() => setError('Could not reach backend API. Is it running on the configured port?'));
  }, []);

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">System Status</h1>
        <p className="text-sm text-gray-500 mb-6">Checks GET /api/health on the backend.</p>

        {error && (
          <div className="rounded-lg bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
        )}

        {health && (
          <dl className="space-y-3 text-sm">
            <Row label="Success" value={String(health.success)} />
            <Row label="Message" value={health.message} />
            <Row label="Database" value={health.database} />
            <Row label="Checked At" value={new Date(health.timestamp).toLocaleString()} />
          </dl>
        )}

        {!health && !error && <p className="text-sm text-gray-400">Checking backend...</p>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 pb-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}
