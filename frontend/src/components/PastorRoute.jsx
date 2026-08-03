import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Pastor-only areas. The API enforces this too; this only avoids showing a dead end. */
export default function PastorRoute() {
  const { user } = useAuth();
  return user?.role === 'pastor' ? <Outlet /> : <Navigate to="/app" replace />;
}
