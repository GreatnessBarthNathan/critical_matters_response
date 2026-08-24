import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from './LoadingScreen';

/** The root path reveals nothing: it simply sends you to your workspace or to sign in. */
export default function RootRedirect() {
  const { user, loading, pendingTotp } = useAuth();
  if (loading) return <LoadingScreen />;
  if (pendingTotp) return <Navigate to="/verify-two-factor" replace />;
  return <Navigate to={user ? '/app' : '/login'} replace />;
}
