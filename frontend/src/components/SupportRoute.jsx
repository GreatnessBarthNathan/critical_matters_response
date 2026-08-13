import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Account-operation pages are exclusive to technical support. Report access is protected
// separately and never inherits this permission.
export default function SupportRoute() {
  const { user } = useAuth();
  return user?.role === 'tech_support' ? <Outlet /> : <Navigate to="/app" replace />;
}
