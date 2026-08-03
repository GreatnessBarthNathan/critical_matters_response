import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import StepIndicator from '../components/StepIndicator';
import RecoveryCodes from '../components/RecoveryCodes';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const STEPS = ['Your details', 'Recovery codes'];

export default function InvitationPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { redeemInvitation } = useAuth();

  const [state, setState] = useState('loading');
  const [invitation, setInvitation] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', confirmPassword: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState([]);

  const inspect = useCallback(async () => {
    try {
      const data = await api(`/invitations/${encodeURIComponent(token)}`);
      setInvitation(data.invitation);
      setState('form');
    } catch {
      // The API answers neutrally, so every unusable link looks the same here too.
      setState('invalid');
    }
  }, [token]);

  useEffect(() => { inspect(); }, [inspect]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'The two passwords do not match.' });
      return;
    }

    setSubmitting(true);
    try {
      const data = await redeemInvitation(token, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        password: form.password,
      });
      setRecoveryCodes(data.recoveryCodes || []);
      setState('recovery');
    } catch (apiError) {
      setError(apiError.message);
      setFieldErrors(apiError.fields || {});
      // Names are preserved so a rejected password does not cost the whole form.
      setForm((current) => ({ ...current, password: '', confirmPassword: '' }));
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'loading') {
    return (
      <AuthLayout title="Checking your invitation" subtitle="One moment.">
        <div className="panel-loading"><span className="spinner" /></div>
      </AuthLayout>
    );
  }

  if (state === 'invalid') {
    return (
      <AuthLayout
        title="This link cannot be used"
        subtitle="It may have expired, already been used, or been withdrawn."
        footer={<p className="auth-switch"><Link to="/login">Return to sign in</Link></p>}
      >
        <p className="muted-note">Ask your pastor to send a new invitation.</p>
      </AuthLayout>
    );
  }

  if (state === 'recovery') {
    return (
      <AuthLayout title="Save your recovery codes" subtitle="Your account is ready.">
        <StepIndicator steps={STEPS} current={1} label="Account setup progress" />
        <RecoveryCodes codes={recoveryCodes} onAcknowledge={() => navigate('/app', { replace: true })} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set up your account" subtitle={`Invitation for ${invitation?.email ?? 'your address'}.`}>
      <StepIndicator steps={STEPS} current={0} label="Account setup progress" />
      <div aria-live="polite" role="status">
        {error && <div className="form-error">{error}</div>}
      </div>
      <form className="stack-form" onSubmit={submit}>
        <div className="form-row">
          <label htmlFor="invite-first">
            First name
            <div className="input-wrap">
              <UserRound size={18} aria-hidden="true" />
              <input
                id="invite-first"
                required
                autoComplete="given-name"
                maxLength={50}
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
              />
            </div>
          </label>
          <label htmlFor="invite-last">
            Last name
            <div className="input-wrap">
              <UserRound size={18} aria-hidden="true" />
              <input
                id="invite-last"
                required
                autoComplete="family-name"
                maxLength={50}
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              />
            </div>
          </label>
        </div>

        <label htmlFor="invite-password">
          Password
          <div className="input-wrap">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              id="invite-password"
              type={show ? 'text' : 'password'}
              minLength={8}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <label htmlFor="invite-confirm">
          Confirm password
          <div className="input-wrap">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              id="invite-confirm"
              type={show ? 'text' : 'password'}
              minLength={8}
              required
              autoComplete="new-password"
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              value={form.confirmPassword}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
            />
          </div>
          {fieldErrors.confirmPassword && <small className="field-error">{fieldErrors.confirmPassword}</small>}
        </label>

        <label className="check-label">
          <input type="checkbox" required />
          I understand each matter I share is visible only to me and the pastor.
        </label>

        <button className="button button--primary button--full" disabled={submitting}>
          {submitting ? <span className="button-spinner" /> : 'Create my account'}
        </button>
      </form>
    </AuthLayout>
  );
}
