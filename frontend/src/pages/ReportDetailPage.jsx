import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, Check, Edit3, History, Lock, MessageCircle, RotateCcw, Save, Send, X } from 'lucide-react';
import { api } from '../api/client';
import Drawer from '../components/Drawer';
import StatusBadge from '../components/StatusBadge';
import Toast from '../components/Toast';
import { allowedActions, categoryLabels, pastorTransitions, statusLabel, urgencyLabels } from '../utils/reportStatus';
import { useAuth } from '../context/AuthContext';

export default function ReportDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const pastor = user.role === 'pastor';

  const [report, setReport] = useState(null);
  const [message, setMessage] = useState('');
  const [edit, setEdit] = useState(null);
  const [showRevisions, setShowRevisions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(location.state?.toast ? { message: location.state.toast } : null);

  useEffect(() => {
    api(`/reports/${id}`)
      .then((data) => setReport(data.report))
      .catch((apiError) => setError(apiError.message));
  }, [id]);

  const actions = report ? allowedActions(report, user) : {};

  const respond = async (event) => {
    event.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    try {
      const data = await api(`/reports/${id}/responses`, { method: 'POST', body: { message } });
      setReport(data.report);
      setMessage('');
      setError('');
      setToast({ message: data.message });
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const transition = async (status) => {
    try {
      const data = await api(`/reports/${id}/status`, { method: 'PATCH', body: { status } });
      setReport((current) => ({ ...current, ...data.report }));
      setError('');
      setToast({ message: data.message });
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  const saveEdit = async () => {
    setLoading(true);
    try {
      const data = await api(`/reports/${id}`, { method: 'PATCH', body: edit });
      setReport((current) => ({ ...current, ...data.report }));
      setEdit(null);
      setError('');
      setToast({ message: data.message });
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  if (error && !report) {
    return <div className="form-error">{error} <Link to="/app/reports">Return to matters</Link></div>;
  }
  if (!report) return <div className="panel-loading full-height"><span className="spinner" /></div>;

  const revisions = report.revisions ?? [];

  return (
    <div className="report-detail-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="page-intro">
        <div>
          <Link className="back-link" to="/app/reports"><ArrowLeft size={15} aria-hidden="true" /> Back</Link>
          <p className="detail-reference">{report.reference}</p>
          <h2>{report.title}</h2>
          <div className="detail-tags">
            <StatusBadge status={report.status} />
            <span className={`priority-text priority-text--${report.urgency}`}>{urgencyLabels[report.urgency]}</span>
            <span className="tag">{categoryLabels[report.category] ?? report.category}</span>
            {report.sensitivity === 'private' && <span className="tag tag--sensitive">Highly sensitive</span>}
          </div>
        </div>
      </div>

      <div className="detail-actions">
        {actions.canEdit && (
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => setEdit({
              title: report.title,
              content: report.content,
              category: report.category,
              urgency: report.urgency,
              sensitivity: report.sensitivity,
            })}
          >
            <Edit3 size={15} aria-hidden="true" /> Edit
          </button>
        )}
        {actions.canViewRevisions && revisions.length > 0 && (
          <button type="button" className="button button--ghost button--small" onClick={() => setShowRevisions(true)}>
            <History size={15} aria-hidden="true" /> History ({revisions.length})
          </button>
        )}
        {actions.canArchive && (
          <button type="button" className="button button--ghost button--small" onClick={() => transition('archived')}>
            <Archive size={15} aria-hidden="true" /> Archive
          </button>
        )}
        {actions.canReopen && (
          <button type="button" className="button button--primary button--small" onClick={() => transition('in_review')}>
            <RotateCcw size={15} aria-hidden="true" /> Reopen
          </button>
        )}
        {actions.canTransition && (
          <label className="status-select">
            <span className="visually-hidden">Change status</span>
            <select value={report.status} onChange={(event) => transition(event.target.value)}>
              {report.status === 'new' && <option value="new">{statusLabel('new')}</option>}
              {pastorTransitions.map((value) => (
                <option key={value} value={value}>{statusLabel(value)}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div aria-live="polite" role="status">
        {error && <div className="form-error">{error}</div>}
      </div>

      <section className="panel original-report">
        <header>
          <span className="avatar avatar--small" style={{ background: report.owner.avatarColor }}>
            {report.owner.firstName[0]}{report.owner.lastName[0]}
          </span>
          <span>
            <strong>{report.owner.firstName} {report.owner.lastName}</strong>
            <small>Original · {new Date(report.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</small>
          </span>
        </header>

        {edit ? (
          <div className="edit-report">
            <label htmlFor="edit-title">
              Subject
              <input id="edit-title" maxLength={160} value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} />
            </label>
            <label htmlFor="edit-content">
              Message
              <textarea id="edit-content" rows={9} maxLength={10000} value={edit.content} onChange={(event) => setEdit({ ...edit, content: event.target.value })} />
            </label>
            <p className="muted-note">Your original wording is kept in the history.</p>
            <div className="wizard-actions">
              <button type="button" className="button button--ghost button--small" onClick={() => setEdit(null)}>
                <X size={15} aria-hidden="true" /> Cancel
              </button>
              <button type="button" className="button button--primary button--small" onClick={saveEdit} disabled={loading}>
                <Save size={15} aria-hidden="true" /> Save changes
              </button>
            </div>
          </div>
        ) : (
          <div className="original-report__content"><p>{report.content}</p></div>
        )}
      </section>

      <h3 className="conversation-heading">Conversation</h3>
      <section className="conversation">
        {report.responses.length === 0 ? (
          <div className="conversation-empty">
            <MessageCircle aria-hidden="true" />
            <p>{pastor ? 'Send a response to begin this conversation.' : 'Your pastor will reply here.'}</p>
          </div>
        ) : report.responses.map((response) => {
          const mine = String(response.author?._id || response.author) === user.id;
          return (
            <article className={`message ${mine ? 'message--mine' : ''}`} key={response._id}>
              <header>
                <strong>{mine ? 'You' : `${response.author?.firstName ?? ''} ${response.author?.lastName ?? ''}`}</strong>
                <small>
                  {response.authorRole === 'pastor' ? 'Pastor' : 'Church leader'} ·{' '}
                  {new Date(response.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </small>
              </header>
              <p>{response.message}</p>
              {mine && <i><Check size={13} aria-hidden="true" /> Sent</i>}
            </article>
          );
        })}
      </section>

      {actions.canRespond ? (
        <form className="reply-box" onSubmit={respond}>
          <label htmlFor="reply-message">
            {pastor ? `Respond to ${report.owner.firstName}` : 'Reply to your pastor'}
            <textarea
              id="reply-message"
              rows={4}
              maxLength={5000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write a response…"
            />
          </label>
          <div className="wizard-actions">
            <button className="button button--primary button--small" disabled={loading || !message.trim()}>
              <Send size={15} aria-hidden="true" /> Send
            </button>
          </div>
        </form>
      ) : (
        <div className="closed-note">
          <Lock size={17} aria-hidden="true" />
          <p>
            This matter is archived and read-only. The conversation stays available to read.
            {pastor ? ' Reopen it to reply again.' : ' Ask your pastor to reopen it if you need to add something.'}
          </p>
        </div>
      )}

      {showRevisions && (
        <Drawer title="Revision history" onClose={() => setShowRevisions(false)}>
          <ol className="revision-list">
            {[...revisions].reverse().map((revision) => (
              <li key={revision.revisionNumber}>
                <header>
                  <strong>Revision {revision.revisionNumber}</strong>
                  <small>
                    {revision.editor?.firstName
                      ? `${revision.editor.firstName} ${revision.editor.lastName} · `
                      : ''}
                    {new Date(revision.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </small>
                </header>
                <dl>
                  {revision.changedFields.map((change) => (
                    <div key={change.field}>
                      <dt>{change.field}</dt>
                      <dd>
                        <span className="revision-old">{String(change.previousValue ?? '—')}</span>
                        <span className="revision-new">{String(change.nextValue ?? '—')}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        </Drawer>
      )}
    </div>
  );
}
