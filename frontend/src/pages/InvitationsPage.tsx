import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, MailPlus, RefreshCw, Trash2 } from 'lucide-react';
import { api, queryString } from '../api/client';
import Toast from '../components/Toast';

const FILTERS = [
  ['all', 'All'],
  ['active', 'Active'],
  ['consumed', 'Used'],
  ['revoked', 'Withdrawn'],
  ['expired', 'Expired'],
];

const STATUS_TONE = { active: 'blue', consumed: 'neutral', revoked: 'neutral', expired: 'gold' };

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  // The plaintext token exists only in this response; it is never stored or shown again.
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/invitations${queryString({ limit: 100 })}`);
      setInvitations(data.invitations);
      setError('');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (event) => {
    event.preventDefault();
    setCreating(true);
    setError('');
    try {
      const data = await api('/invitations', { method: 'POST', body: { email: email.trim() } });
      setIssued({ email: data.invitation.email, link: `${window.location.origin}/invite/${data.token}` });
      setCopied(false);
      setEmail('');
      setToast({ message: 'Invitation created. Copy the link now — it is shown only once.' });
      await load();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (invitation) => {
    try {
      const data = await api(`/invitations/${invitation.id}`, { method: 'DELETE' });
      setToast({ message: data.message ?? 'Invitation withdrawn.' });
      await load();
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(issued.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const visible = filter === 'all' ? invitations : invitations.filter((item) => item.status === filter);

  return (
    <div className="invitations-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="page-intro">
        <div>
          <h2>Invitations</h2>
          <p>Only invited leaders can create an account.</p>
        </div>
      </div>

      <div aria-live="polite" role="status">
        {error && <div className="form-error">{error}</div>}
      </div>

      <section className="panel form-card">
        <h3>Invite a leader</h3>
        <form className="stack-form" onSubmit={create}>
          <label htmlFor="invite-email">
            Email address
            <div className="input-wrap">
              <MailPlus size={18} aria-hidden="true" />
              <input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="leader@example.com"
              />
            </div>
          </label>
          <button className="button button--primary button--full" disabled={creating}>
            {creating ? <span className="button-spinner" /> : 'Create invitation'}
          </button>
        </form>

        {issued && (
          <div className="issued-link" role="note">
            <p><strong>Link for {issued.email}</strong></p>
            <code>{issued.link}</code>
            <p className="muted-note">
              Share this privately, in person or by a channel you trust. Creating a new invitation for the
              same address withdraws this one.
            </p>
            <div className="wizard-actions">
              <button type="button" className="button button--ghost button--small" onClick={copyLink}>
                {copied ? <><Check size={15} aria-hidden="true" /> Copied</> : <><Copy size={15} aria-hidden="true" /> Copy link</>}
              </button>
              <button type="button" className="button button--ghost button--small" onClick={() => setIssued(null)}>
                Done
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="filter-bar filter-bar--chips" role="group" aria-label="Filter invitations">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`chip ${filter === value ? 'chip--active' : ''}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="icon-button" onClick={load} aria-label="Refresh list">
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      <section className="panel section-panel">
        <header className="section-panel__header">
          <h3>{loading ? 'Loading…' : `${visible.length} ${visible.length === 1 ? 'invitation' : 'invitations'}`}</h3>
        </header>

        {loading ? (
          <div className="panel-loading"><span className="spinner" /></div>
        ) : visible.length === 0 ? (
          <p className="empty-note">No invitations match this filter.</p>
        ) : (
          <ul className="record-list">
            {visible.map((invitation) => (
              <li key={invitation.id}>
                <div className="record-list__main">
                  <strong>{invitation.email}</strong>
                  <small>
                    Created {new Date(invitation.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    {invitation.status === 'active' && ` · expires ${new Date(invitation.expiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`}
                  </small>
                </div>
                <span className={`status-badge status-badge--${STATUS_TONE[invitation.status] ?? 'neutral'}`}>
                  {FILTERS.find(([value]) => value === invitation.status)?.[1] ?? invitation.status}
                </span>
                {invitation.status === 'active' && (
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => revoke(invitation)}
                  >
                    <Trash2 size={15} aria-hidden="true" /> Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
