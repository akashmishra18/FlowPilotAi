import { Link } from 'react-router-dom';
import { Bot, ShieldCheck, GitBranch, BarChart3, MessageSquareText, ArrowRight } from 'lucide-react';

const features = [
  {
    icon: Bot,
    title: 'Agentic AI Assistant',
    description: 'Understands natural-language goals, plans multi-step workflows, and executes through controlled tools — not raw database access.',
  },
  {
    icon: ShieldCheck,
    title: 'Human-in-the-loop Safety',
    description: 'Risky actions require an approval preview, an automatic backup, and post-execution verification before anything is final.',
  },
  {
    icon: GitBranch,
    title: 'Full Operations Tracking',
    description: 'Employees, projects, tasks, bugs, and client issues — all in one place, tied together with role-based access control.',
  },
  {
    icon: MessageSquareText,
    title: 'Client Communication',
    description: 'WhatsApp and email messages become tracked tickets automatically, with reminders and escalation for anything left unresolved.',
  },
  {
    icon: BarChart3,
    title: 'Cost & Usage Visibility',
    description: 'Track AI/API token spend and AWS/cloud usage alongside team productivity and project progress.',
  },
];

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="text-center mb-16">
        <span className="inline-block text-xs font-semibold tracking-wide text-brand-700 bg-brand-50 rounded-full px-3 py-1 mb-4">
          FOR GAME DEVELOPMENT STUDIOS
        </span>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Agentic AI for game studio operations
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto">
          FlowPilot AI turns client messages, bug reports, and day-to-day
          operations work into tracked, automated workflows — with an AI
          agent that plans and acts through controlled tools, always with a
          human able to approve, verify, and roll back.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            View Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/status"
            className="inline-flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            System Status
          </Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map(({ icon: Icon, title, description }) => (
          <div key={title} className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center mb-4">
              <Icon className="w-5 h-5 text-brand-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
