import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import RecoveryCodes from './RecoveryCodes';

/**
 * Shared authenticator enrolment. Required for pastors, optional for leaders.
 * On success it hands back the one-time recovery codes for the caller to acknowledge.
 */
export default function TotpSetup({ onEnabled, requireCurrentPassword = false }) {
  const [stage, setStage] = useState('idle');
  const [setup, setSetup] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [token, setToken] = useState('');
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const begin = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/auth/totp/setup', {
        method: 'POST',
        body: requireCurrentPassword ? { currentPassword } : {},
      });
      setSetup(data);
      setStage('confirm');
      setCurrentPassword('');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/auth/totp/confirm', { method: 'POST', body: { token: token.trim() } });
      setCodes(data.recoveryCodes ?? []);
      setStage('codes');
    } catch (apiError) {
      setError(apiError.message);
      setToken('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="totp-setup">
      <div aria-live="polite" role="status">
        {error && <div className="form-error">{error}</div>}
      </div>

      {stage === 'idle' && (
        <form className="stack-form" onSubmit={begin}>
          {requireCurrentPassword && (
            <label htmlFor="totp-current-password">
              Current password
              <div className="input-wrap">
                <input
                  id="totp-current-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>
            </label>
          )}
          <button className="button button--primary button--full" disabled={busy}>
            {busy ? <span className="button-spinner" /> : <><ShieldCheck size={16} aria-hidden="true" /> Set up authenticator</>}
          </button>
        </form>
      )}

      {stage === 'confirm' && setup && (
        <form className="stack-form" onSubmit={confirm}>
          <p className="muted-note">Scan this code with your authenticator app, then enter the six digits it shows.</p>
          {setup.qrDataUrl && <img className="totp-qr" src={setup.qrDataUrl} alt="Authenticator setup QR code" width={180} height={180} />}
          <details>
            <summary>Enter the key manually</summary>
            <code className="totp-secret">{setup.otpauthUrl}</code>
          </details>
          <label htmlFor="totp-confirm-token">
            Six-digit code
            <div className="input-wrap">
              <input
                id="totp-confirm-token"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoComplete="one-time-code"
                value={token}
                onChange={(event) => setToken(event.target.value.replace(/\D/g, ''))}
              />
            </div>
          </label>
          <button className="button button--primary button--full" disabled={busy || token.length !== 6}>
            {busy ? <span className="button-spinner" /> : 'Confirm and enable'}
          </button>
        </form>
      )}

      {stage === 'codes' && (
        <RecoveryCodes codes={codes} onAcknowledge={onEnabled} actionLabel="I have saved my codes" />
      )}
    </div>
  );
}
