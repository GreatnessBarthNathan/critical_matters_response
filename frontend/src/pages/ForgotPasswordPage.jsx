import { KeyRound, LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import AuthLayout from '../components/AuthLayout';

export default function ForgotPasswordPage() {
  const [form, setForm] = useState({ email: '', recoveryKey: '', newPassword: '' });
  const [state, setState] = useState({ error: '', success: '', loading: false });
  const submit = async (event) => {
    event.preventDefault(); setState({ error: '', success: '', loading: true });
    try { const data = await api('/auth/reset-password', { method: 'POST', body: form }); setState({ error: '', success: data.message, loading: false }); } catch (error) { setState({ error: error.message, success: '', loading: false }); }
  };
  return <AuthLayout title="Reset your password" subtitle="No email will be sent. Use the recovery key saved when you joined.">
    {state.error && <div className="form-error">{state.error}</div>}{state.success && <div className="form-success">{state.success}</div>}
    <form className="stack-form" onSubmit={submit}>
      <label>Email address<div className="input-wrap"><Mail size={18} /><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></div></label>
      <label>Recovery key<div className="input-wrap"><KeyRound size={18} /><input required value={form.recoveryKey} onChange={(e) => setForm({ ...form, recoveryKey: e.target.value.toUpperCase() })} placeholder="XXXX-XXXX-XXXX" /></div></label>
      <label>New password<div className="input-wrap"><LockKeyhole size={18} /><input type="password" minLength="8" required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} placeholder="At least 8 characters" /></div></label>
      <button className="button button--primary button--full" disabled={state.loading}>Reset password</button>
    </form>
    <p className="auth-switch"><Link to="/login">Return to sign in</Link></p>
  </AuthLayout>;
}
