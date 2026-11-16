import { Activity, Bot, CheckSquare, FolderKanban, LayoutDashboard, MessageSquare, ShieldCheck, Users, Headset, type LucideIcon } from 'lucide-react';
import { CurrentUser } from '@/store/authStore';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** UI convenience only; the backend remains authoritative. */
  allow?: CurrentUser['role'][];
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  { label: 'People', items: [{ to: '/employees', label: 'Employees', icon: Users, allow: ['ADMIN', 'MANAGER'] }] },
  {
    label: 'Work',
    items: [
      { to: '/projects', label: 'Projects', icon: FolderKanban },
      { to: '/tasks', label: 'Tasks', icon: CheckSquare },
    ],
  },
  { label: 'Requests', items: [{ to: '/approvals', label: 'Approvals', icon: ShieldCheck }] },
  { label: 'Client support', items: [{ to: '/client-issues', label: 'Client issues', icon: Headset }] },
  { label: 'Communication', items: [{ to: '/messages', label: 'Messages', icon: MessageSquare, allow: ['ADMIN', 'MANAGER', 'EMPLOYEE'] }] },
  { label: 'Assistant', items: [{ to: '/ai-agent', label: 'Overdue Task Assistant', icon: Bot }] },
  { label: 'Analytics', items: [{ to: '/ai-usage', label: 'AI Usage & Cost', icon: Activity }] },
];
