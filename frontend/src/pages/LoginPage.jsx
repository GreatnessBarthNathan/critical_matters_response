import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  if (user) return <Navigate to="/app" replace />;

  const submit = async (event) => {
    event.preventDefault(); setError(''); setSubmitting(true);
    try { await login(form); navigate('/app'); } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your private care space.">
      {error && <div className="form-error">{error}</div>}
      <form className="stack-form" onSubmit={submit}>
        <label>Email address<div className="input-wrap"><Mail size={18} /><input type="email" autoComplete="email" required placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div></label>
        <label>Password<div className="input-wrap"><LockKeyhole size={18} /><input type={show ? 'text' : 'password'} autoComplete="current-password" required placeholder="Enter your password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button type="button" onClick={() => setShow(!show)} aria-label="Toggle password visibility">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <div className="form-between"><label className="check-label"><input type="checkbox" /> Keep me signed in</label><Link to="/forgot-password">Forgot password?</Link></div>
        <button className="button button--primary button--full" disabled={submitting}>{submitting ? <span className="button-spinner" /> : 'Sign in securely'}</button>
      </form>
      <p className="auth-switch">New to Critical Matters? <Link to="/register">Create an account</Link></p>
      <p className="security-note"><ShieldCheck size={15} /> Your session is protected and private.</p>
    </AuthLayout>
  );
}

function ShieldCheck(props) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/><path d="m9 12 2 2 4-4"/></svg>; }
