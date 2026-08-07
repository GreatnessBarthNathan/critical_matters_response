import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, queryString } from '../api/client';
import RecoveryCodes from '../components/RecoveryCodes';
import TotpSetup from '../components/TotpSetup';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 25;

function metadataSummary(metadata = {}) {
  const parts = [];
  if (metadata.ip) parts.push(metadata.ip);
  if (metadata.reason) parts.push(metadata.reason);
  if (metadata.changedFields?.length) parts.push(`changed: ${metadata.changedFields.join(', ')}`);
  return parts.join(' · ');
}

export default function SecurityPage() {
  const { user, refreshUser } = useAuth();
  const [audit, setAudit] = useState(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [newCodes, setNewCodes] = useState(null);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/audit${queryString({ page, limit: PAGE_SIZE, action: actionFilter || undefined })}`);
      setAudit(data);
      setError('');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => { loadAudit(); }, [loadAudit]);

  const regenerate = async () => {
    try {
      const data = await api('/auth/recovery-codes/regenerate', { method: 'POST' });
      setNewCodes(data.recoveryCodes);
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  const totpEnabled = Boolean(user.totpEnabled ?? user.totp?.enabled);

  return (
    <div className="security-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="page-intro">
        <div>
          <h2>Security & audit</h2>
          <p>Two-factor authentication, recovery codes and the activity record.</p>
        </div>
      </div>

      <div aria-live="polite" role="status">
        {error && <div className="form-error">{error}</div>}
      </div>

      <section className="panel form-card">
        <h3><ShieldCheck size={17} aria-hidden="true" /> Two-factor authentication</h3>
        {totpEnabled ? (
          <p className="muted-note">
            Your authenticator is active. Every sign-in asks for a six-digit code.
          </p>
        ) : (
          <>
            <p className="muted-note">
              Two-factor authentication is optional for now. Enable it to add an extra layer of protection to your account.
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
        <h3><KeyRound size={17} aria-hidden="true" /> Recovery codes</h3>
        {newCodes ? (
          <RecoveryCodes
            codes={newCodes}
            onAcknowledge={() => { setNewCodes(null); setToast({ message: 'New recovery codes saved.' }); }}
          />
        ) : (
          <>
            <p className="muted-note">
              Generating new codes immediately invalidates every previous code.
            </p>
            <button type="button" className="button button--ghost button--full" onClick={regenerate}>
              <RefreshCw size={16} aria-hidden="true" /> Generate new recovery codes
            </button>
          </>
        )}
      </section>

      <section className="panel section-panel">
        <header className="section-panel__header">
          <h3>Activity record</h3>
          <label>
            <span className="visually-hidden">Filter by action</span>
            <select
              value={actionFilter}
              onChange={(event) => { setActionFilter(event.target.value); setPage(1); }}
            >
              <option value="">All actions</option>
              <option value="auth.login">Sign-ins</option>
              <option value="invitation.create">Invitations created</option>
              <option value="invitation.redeem">Invitations redeemed</option>
              <option value="report.create">Matters created</option>
              <option value="report.view">Matters viewed</option>
              <option value="report.edit">Matters edited</option>
              <option value="report.transition">Status changes</option>
            </select>
          </label>
        </header>

        {loading ? (
          <div className="panel-loading"><span className="spinner" /></div>
        ) : !audit?.events.length ? (
          <p className="empty-note">No activity matches this filter.</p>
        ) : (
          <>
            <ul className="record-list record-list--audit">
              {audit.events.map((event) => (
                <li key={event.id}>
                  <div className="record-list__main">
                    <strong>{event.action}</strong>
                    <small>
                      {event.actor ? `${event.actor.firstName} ${event.actor.lastName}` : 'System'} ·{' '}
                      {new Date(event.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </small>
                    {metadataSummary(event.metadata) && <small>{metadataSummary(event.metadata)}</small>}
                  </div>
                  <span className={`status-badge status-badge--${event.result === 'success' ? 'blue' : 'neutral'}`}>
                    {event.result}
                  </span>
                </li>
              ))}
            </ul>

            <nav className="pager" aria-label="Activity pages">
              <button
                type="button"
                className="button button--ghost button--small"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {audit.pagination.page} of {Math.max(audit.pagination.pages, 1)}</span>
              <button
                type="button"
                className="button button--ghost button--small"
                disabled={!audit.pagination.hasNextPage}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          </>
        )}
      </section>
    </div>
  );
}
