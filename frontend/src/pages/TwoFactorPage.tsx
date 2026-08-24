import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';

export default function TwoFactorPage() {
  const { user, pendingTotp, verifyLoginTotp, cancelTotp } = useAuth();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/app" replace />;
  // This route only exists for a session that has already passed the password step.
  if (!pendingTotp) return <Navigate to="/login" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await verifyLoginTotp(token.trim());
      navigate('/app', { replace: true });
    } catch (apiError) {
      setError(apiError.message);
      setToken('');
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => {
    cancelTotp();
    navigate('/login', { replace: true });
  };

  return (
    <AuthLayout title="Verification code" subtitle="Enter the six-digit code from your authenticator app.">
      <div aria-live="polite" role="status">
        {error && <div className="form-error">{error}</div>}
      </div>
      <form className="stack-form" onSubmit={submit}>
        <label htmlFor="totp-token">
          Authenticator code
          <div className="input-wrap">
            <KeyRound size={18} aria-hidden="true" />
            <input
              id="totp-token"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              placeholder="123456"
              value={token}
              onChange={(event) => setToken(event.target.value.replace(/\D/g, ''))}
            />
          </div>
        </label>
        <button className="button button--primary button--full" disabled={submitting || token.length !== 6}>
          {submitting ? <span className="button-spinner" /> : 'Verify and continue'}
        </button>
      </form>
      <button type="button" className="link-button" onClick={startOver}>Use a different account</button>
    </AuthLayout>
  );
}
