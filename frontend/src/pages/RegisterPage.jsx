import { Eye, EyeOff, LockKeyhole, Mail, UserRound, Copy, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [show, setShow] = useState(false); const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false); const [recoveryKey, setRecoveryKey] = useState('');
  if (user && !recoveryKey) return <Navigate to="/app" replace />;

  const submit = async (event) => {
    event.preventDefault(); setError(''); setSubmitting(true);
    try { const data = await register(form); setRecoveryKey(data.recoveryKey); } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  if (recoveryKey) return <AuthLayout title="Your account is ready" subtitle="Save this key before entering your dashboard."><div className="recovery-success"><CheckCircle2 size={38} /><h3>Save your recovery key</h3><p>Because this service sends no emails, this key is the only way to reset a forgotten password. It will not be shown again.</p><div className="recovery-code"><strong>{recoveryKey}</strong><button onClick={() => navigator.clipboard.writeText(recoveryKey)}><Copy size={17} /> Copy</button></div><button className="button button--primary button--full" onClick={() => navigate('/app')}>I’ve saved it — continue</button></div></AuthLayout>;

  return (
    <AuthLayout title="Create your account" subtitle="Start a confidential conversation with your pastor.">
      {error && <div className="form-error">{error}</div>}
      <form className="stack-form" onSubmit={submit}>
        <div className="form-row"><label>First name<div className="input-wrap"><UserRound size={18} /><input required autoComplete="given-name" placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div></label><label>Last name<div className="input-wrap"><UserRound size={18} /><input required autoComplete="family-name" placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div></label></div>
        <label>Email address<div className="input-wrap"><Mail size={18} /><input type="email" required autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div></label>
        <label>Password<div className="input-wrap"><LockKeyhole size={18} /><input type={show ? 'text' : 'password'} minLength="8" required autoComplete="new-password" placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button type="button" onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <label className="check-label terms"><input type="checkbox" required /> I understand my reports are visible only to me and the pastor.</label>
        <button className="button button--primary button--full" disabled={submitting}>{submitting ? <span className="button-spinner" /> : 'Create secure account'}</button>
      </form>
      <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
    </AuthLayout>
  );
}
