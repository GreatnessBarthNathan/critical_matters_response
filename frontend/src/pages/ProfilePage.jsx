import { useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Save, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '../api/client';
import RecoveryCodes from '../components/RecoveryCodes';
import TotpSetup from '../components/TotpSetup';
import PushNotifications from '../components/PushNotifications';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const COLOURS = ['#1a80e6', '#51a2ff', '#66478f', '#1f6b48', '#8a6410'];

export default function ProfilePage() {
  const { user, setUser, refreshUser } = useAuth();
  const [form, setForm] = useState(user);
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' });
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const [newCodes, setNewCodes] = useState(null);

  useEffect(() => setForm(user), [user]);

  const pastor = user.role === 'admin';
  const totpEnabled = Boolean(user.totpEnabled);

  const save = async (event) => {
    event.preventDefault();
    try {
      const data = await api('/users/profile', { method: 'PATCH', body: form });
      setUser(data.user);
      setError('');
      setToast({ message: data.message });
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    try {
      const data = await api('/auth/change-password', { method: 'PATCH', body: password });
      setPassword({ currentPassword: '', newPassword: '' });
      setError('');
      setToast({ message: data.message });
    } catch (apiError) {
      setError(apiError.message);
      setPassword({ currentPassword: '', newPassword: '' });
    }
  };

  const regenerate = async () => {
    try {
      const data = await api('/auth/recovery-codes/regenerate', { method: 'POST' });
      setNewCodes(data.recoveryCodes);
      setError('');
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  return (
    <div className="profile-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="page-intro">
        <div>
          <h2>Profile</h2>
          <p>Your details, password and account security.</p>
        </div>
      </div>

      <div aria-live="polite" role="status">
        {error && <div className="form-error">{error}</div>}
      </div>

      <section className="panel profile-summary">
        <span className="avatar avatar--large" style={{ background: form.avatarColor }}>
          {form.firstName[0]}{form.lastName[0]}
        </span>
        <h3>{form.firstName} {form.lastName}</h3>
        <p>{pastor ? 'Admin' : form.ministry || 'Church leader'}</p>
        <fieldset className="colour-picker">
          <legend>Profile colour</legend>
          {COLOURS.map((colour) => (
            <button
              key={colour}
              type="button"
              className={form.avatarColor === colour ? 'selected' : ''}
              style={{ background: colour }}
              aria-label={`Use colour ${colour}`}
              aria-pressed={form.avatarColor === colour}
              onClick={() => setForm({ ...form, avatarColor: colour })}
            />
          ))}
        </fieldset>
      </section>

      <form className="panel form-card" onSubmit={save}>
        <h3><UserRound size={17} aria-hidden="true" /> Personal information</h3>
        <div className="form-row">
          <label htmlFor="profile-first">
            First name
            <input id="profile-first" required value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          </label>
          <label htmlFor="profile-last">
            Last name
            <input id="profile-last" required value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          </label>
        </div>
        <label htmlFor="profile-email">
          Email address
          <input id="profile-email" value={form.email} disabled />
          <small>Your email address identifies your account and cannot be changed here.</small>
        </label>
        <label htmlFor="profile-phone">
          Phone number
          <input id="profile-phone" value={form.phone || ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Optional" />
        </label>
        <label htmlFor="profile-ministry">
          Ministry or role
          <input id="profile-ministry" value={form.ministry || ''} onChange={(event) => setForm({ ...form, ministry: event.target.value })} placeholder="e.g. Youth ministry" />
        </label>
        <div className="wizard-actions">
          <button className="button button--primary button--small"><Save size={15} aria-hidden="true" /> Save</button>
        </div>
      </form>

      <form className="panel form-card" onSubmit={changePassword}>
        <h3><KeyRound size={17} aria-hidden="true" /> Change password</h3>
        <label htmlFor="profile-current-password">
          Current password
          <input
            id="profile-current-password"
            type="password"
            required
            autoComplete="current-password"
            value={password.currentPassword}
            onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })}
          />
        </label>
        <label htmlFor="profile-new-password">
          New password
          <input
            id="profile-new-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password.newPassword}
            onChange={(event) => setPassword({ ...password, newPassword: event.target.value })}
          />
          <small>At least 8 characters. Changing it signs out your other devices.</small>
        </label>
        <div className="wizard-actions">
          <button className="button button--ghost button--small">Update password</button>
        </div>
      </form>

      <section className="panel form-card">
        <h3><ShieldCheck size={17} aria-hidden="true" /> Two-factor authentication</h3>
        {totpEnabled ? (
          <p className="muted-note">Active. Every sign-in asks for a code from your authenticator app.</p>
        ) : (
          <>
            <p className="muted-note">
              Optional, and strongly recommended. You will be asked for a code from your authenticator app each time you sign in.
            </p>
            <TotpSetup
              requireCurrentPassword
              onEnabled={async () => {
                await refreshUser();
                setToast({ message: 'Two-factor authentication is enabled.' });
              }}
            />
          </>
        )}
      </section>

      <section className="panel form-card">
        <h3><ShieldCheck size={17} aria-hidden="true" /> Push notifications</h3>
        <PushNotifications onChange={(isEnabled) => setToast({ message: isEnabled ? 'Notifications enabled.' : 'Notifications disabled.' })} />
      </section>

      <section className="panel form-card">
        <h3><RefreshCw size={17} aria-hidden="true" /> Recovery codes</h3>
        {newCodes ? (
          <RecoveryCodes
            codes={newCodes}
            onAcknowledge={() => { setNewCodes(null); setToast({ message: 'New recovery codes saved.' }); }}
          />
        ) : (
          <>
            <p className="muted-note">
              These are how you regain access without email. Generating new codes invalidates all previous ones.
            </p>
            <button type="button" className="button button--ghost button--full" onClick={regenerate}>
              Generate new recovery codes
            </button>
          </>
        )}
      </section>
    </div>
  );
}
