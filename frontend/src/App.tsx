import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import AdaptiveLayout from './layouts/AdaptiveLayout';
import PublicLayout from './layouts/PublicLayout';
import ProtectedRoute from './components/ProtectedRoute';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import PageFallback from './components/PageFallback';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';

// Route-level code splitting: each page loads on first visit.
const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const SystemStatusPage = lazy(() => import('./pages/SystemStatusPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const TaskDetailPage = lazy(() => import('./pages/TaskDetailPage'));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'));
const EmployeeDetailPage = lazy(() => import('./pages/EmployeeDetailPage'));
const MyProfilePage = lazy(() => import('./pages/MyProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PlannedModulePage = lazy(() => import('./pages/PlannedModulePage'));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'));
const AIUsagePage = lazy(() => import('./pages/AIUsagePage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const ClientIssuesPage = lazy(() => import('./pages/ClientIssuesPage'));
const AgentWorkflowPage = lazy(() => import('./pages/AgentWorkflowPage'));

export default function App() {
  // Attempts a silent session restore via the refresh-token cookie on load.
  useAuthBootstrap();

  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="min-h-screen bg-canvas p-8">
            <PageFallback />
          </div>
        }
      >
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
          </Route>

          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Public, but rendered inside the app shell when signed in. */}
          <Route element={<AdaptiveLayout />}>
            <Route path="/status" element={<SystemStatusPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/profile" element={<MyProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />

              {/* Open to every authenticated role: the backend scopes what each role can see. */}
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/:id" element={<TaskDetailPage />} />

              {/* The assistant and approvals routes are available; the remaining roadmap routes explain their limits. */}
              <Route path="/ai-agent" element={<AgentWorkflowPage />} />
              <Route path="/approvals" element={<ApprovalsPage />} />
              <Route path="/ai-usage" element={<AIUsagePage />} />
              <Route path="/messages/:conversationId?" element={<MessagesPage />} />
              <Route path="/client-issues" element={<ClientIssuesPage />} />
              <Route path="/activity" element={<PlannedModulePage module="activity" />} />
              <Route path="/integrations" element={<PlannedModulePage module="integrations" />} />

              <Route element={<RoleProtectedRoute allow={['ADMIN', 'MANAGER']} />}>
                <Route path="/employees" element={<EmployeesPage />} />
                <Route path="/employees/:id" element={<EmployeeDetailPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
