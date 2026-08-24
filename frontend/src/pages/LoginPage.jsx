import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, pendingTotp, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/app" replace />;
  if (pendingTotp) return <Navigate to="/verify-two-factor" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await login(form);
      navigate(data.requiresTotp ? '/verify-two-factor' : '/app', { replace: true });
    } catch (apiError) {
      setError(apiError.message);
      // The email is kept so only the password has to be retyped.
      setForm((current) => ({ ...current, password: '' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Enter your details to continue."
      footer={<p className="security-note"><ShieldCheck size={14} aria-hidden="true" /> Encrypted in transit and at rest.</p>}
    >
      <div aria-live="polite" role="status">
        {error && <div className="form-error">{error}</div>}
      </div>
      <form className="stack-form" onSubmit={submit}>
        <label htmlFor="login-email">
          Email address
          <div className="input-wrap">
            <Mail size={18} aria-hidden="true" />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
        </label>

        <label htmlFor="login-password">
          Password
          <div className="input-wrap">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              id="login-password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <button className="button button--primary button--full" disabled={submitting}>
          {submitting ? <span className="button-spinner" /> : 'Sign in'}
        </button>
      </form>

      {/* No public registration: access begins with a Tech Support invitation. */}
      <p className="auth-switch"><Link to="/forgot-password">Trouble signing in?</Link></p>
    </AuthLayout>
  );
}
