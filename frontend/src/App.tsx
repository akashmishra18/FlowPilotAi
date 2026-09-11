import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import SystemStatusPage from './pages/SystemStatusPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';

export default function App() {
  // Attempts a silent session restore via the refresh-token cookie on load.
  useAuthBootstrap();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/status" element={<SystemStatusPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
