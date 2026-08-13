import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import SupportRoute from './components/SupportRoute';
import ReportParticipantRoute from './components/ReportParticipantRoute';
import DashboardLayout from './components/DashboardLayout';
import RootRedirect from './components/RootRedirect';
import LoginPage from './pages/LoginPage';
import TwoFactorPage from './pages/TwoFactorPage';
import InvitationPage from './pages/InvitationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import CreateReportPage from './pages/CreateReportPage';
import ReportsPage from './pages/ReportsPage';
import ArchivedReportsPage from './pages/ArchivedReportsPage';
import ReportDetailPage from './pages/ReportDetailPage';
import ProfilePage from './pages/ProfilePage';
import InvitationsPage from './pages/InvitationsPage';
import UsersPage from './pages/UsersPage';
import HelpPage from './pages/HelpPage';

export default function App() {
  return (
    <Routes>
      {/* No public landing page and no public registration. */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify-two-factor" element={<TwoFactorPage />} />
      <Route path="/invite/:token" element={<InvitationPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<DashboardLayout />}>
          <Route index element={<DashboardPage />} />
          <Route element={<ReportParticipantRoute />}>
            <Route path="reports/new" element={<CreateReportPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="reports/archived" element={<ArchivedReportsPage />} />
            <Route path="reports/:id" element={<ReportDetailPage />} />
          </Route>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="help" element={<HelpPage />} />
          <Route element={<SupportRoute />}>
            <Route path="invitations" element={<InvitationsPage />} />
            <Route path="people" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
