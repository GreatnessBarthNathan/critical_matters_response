import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, KeyRound, Search, UserCheck, UserX } from 'lucide-react';
import { api } from '../api/client';
import Toast from '../components/Toast';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  // Reset codes are shown once, for the pastor to read aloud after verifying the person.
  const [resetCode, setResetCode] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api('/users')
      .then((data) => setUsers(data.users))
      .catch((apiError) => setError(apiError.message));
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((item) => `${item.firstName} ${item.lastName} ${item.email} ${item.ministry ?? ''}`
      .toLowerCase().includes(needle));
  }, [users, search]);

  const toggle = async (item) => {
    try {
      const data = await api(`/users/${item.id}/status`, { method: 'PATCH', body: { isActive: !item.isActive } });
      setUsers((current) => current.map((entry) => (
        entry.id === item.id ? { ...entry, isActive: data.user.isActive } : entry
      )));
      setError('');
      setToast({ message: data.message });
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  const issueResetCode = async (item) => {
    try {
      const data = await api(`/users/${item.id}/reset-code`, { method: 'POST' });
      setResetCode({ name: `${item.firstName} ${item.lastName}`, code: data.resetCode, expiresAt: data.expiresAt });
      setCopied(false);
      setError('');
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(resetCode.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="users-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="page-intro">
        <div>
          <h2>Church leaders</h2>
          <p>Activate accounts and issue one-time reset codes.</p>
        </div>
      </div>

      <div aria-live="polite" role="status">
        {error && <div className="form-error">{error}</div>}
      </div>

      {resetCode && (
        <section className="panel form-card issued-link" role="note">
          <h3>Reset code for {resetCode.name}</h3>
          <code>{resetCode.code}</code>
          <p className="muted-note">
            Read this to {resetCode.name} only after you are certain who you are speaking to. It expires{' '}
            {new Date(resetCode.expiresAt).toLocaleTimeString(undefined, { timeStyle: 'short' })} and works once.
            Passwords are never shown here.
          </p>
          <div className="wizard-actions">
            <button type="button" className="button button--ghost button--small" onClick={copyCode}>
              {copied ? <><Check size={15} aria-hidden="true" /> Copied</> : <><Copy size={15} aria-hidden="true" /> Copy</>}
            </button>
            <button type="button" className="button button--ghost button--small" onClick={() => setResetCode(null)}>
              Done
            </button>
          </div>
        </section>
      )}

      <div className="filter-bar">
        <div className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search leaders"
            placeholder="Search by name, email or ministry"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <section className="panel section-panel">
        <header className="section-panel__header">
          <h3>{filtered.length} {filtered.length === 1 ? 'leader' : 'leaders'}</h3>
        </header>

        {filtered.length === 0 ? (
          <p className="empty-note">No leaders match this search.</p>
        ) : (
          <ul className="record-list">
            {filtered.map((item) => (
              <li key={item.id}>
                <div className="record-list__main">
                  <strong>{item.firstName} {item.lastName}</strong>
                  <small>{item.email}</small>
                  <small>{item.ministry || 'Church leader'} · {item.reportCount} matters, {item.openCount} open</small>
                </div>
                <span className={`status-badge status-badge--${item.isActive ? 'blue' : 'neutral'}`}>
                  {item.isActive ? 'Active' : 'Inactive'}
                </span>
                <div className="record-list__actions">
                  <button type="button" className="button button--ghost button--small" onClick={() => issueResetCode(item)}>
                    <KeyRound size={15} aria-hidden="true" /> Reset code
                  </button>
                  <button type="button" className="button button--ghost button--small" onClick={() => toggle(item)}>
                    {item.isActive
                      ? <><UserX size={15} aria-hidden="true" /> Deactivate</>
                      : <><UserCheck size={15} aria-hidden="true" /> Activate</>}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
