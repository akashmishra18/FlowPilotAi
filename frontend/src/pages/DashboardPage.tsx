import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ListTodo, Bug, Users, MessageCircleWarning } from 'lucide-react';

// Static placeholder series — no live data source yet (added in Phase 3).
// Shown only to establish the chart component and visual style.
const placeholderTaskTrend = [
  { day: 'Mon', completed: 4 },
  { day: 'Tue', completed: 7 },
  { day: 'Wed', completed: 5 },
  { day: 'Thu', completed: 9 },
  { day: 'Fri', completed: 6 },
];

const summaryCards = [
  { label: 'Open Tasks', value: '—', icon: ListTodo },
  { label: 'Open Bugs', value: '—', icon: Bug },
  { label: 'Employees', value: '—', icon: Users },
  { label: 'Client Issues', value: '—', icon: MessageCircleWarning },
];

export default function DashboardPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">
          Placeholder view — real data wiring begins in Phase 3 (employees, projects, tasks).
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {summaryCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{label}</span>
              <Icon className="w-4 h-4 text-gray-400" />
            </div>
            <span className="text-2xl font-semibold text-gray-900">{value}</span>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Tasks Completed (sample chart)</h3>
          <span className="text-xs text-gray-400">Demo data — not live</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={placeholderTaskTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="completed" stroke="#3b6fed" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
