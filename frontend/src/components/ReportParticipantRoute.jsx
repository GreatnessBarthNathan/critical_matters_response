import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ReportParticipantRoute() {
  const { user } = useAuth();
  return ['user', 'admin'].includes(user?.role) ? <Outlet /> : <Navigate to="/app" replace />;
}
