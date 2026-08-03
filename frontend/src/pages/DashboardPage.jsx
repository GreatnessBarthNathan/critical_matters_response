import { ArrowRight, Clock3, FileLock2, FileText, MessageCircleHeart, Plus, ShieldCheck, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth(); const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { api('/reports/stats').then(setData).catch((err) => setError(err.message)); }, []);
  const pastor = user.role === 'pastor';
  const stats = data?.stats || { total: 0, submitted: 0, inReview: 0, responded: 0, closed: 0, private: 0 };
  const cards = pastor ? [
    ['Total matters', stats.total, FileText, 'green'], ['Awaiting review', stats.submitted, Clock3, 'gold'], ['In conversation', stats.inReview + stats.responded, MessageCircleHeart, 'blue'], ['Private matters', stats.private, FileLock2, 'purple'],
  ] : [['All reports', stats.total, FileText, 'green'], ['Awaiting response', stats.submitted + stats.inReview, Clock3, 'gold'], ['Pastor responded', stats.responded, MessageCircleHeart, 'blue'], ['Closed matters', stats.closed, ShieldCheck, 'purple']];
  return <div className="dashboard-page">
    <section className="welcome-banner"><div><span>{pastor ? 'Pastoral care centre' : 'Your confidential care space'}</span><h2>{pastor ? `Welcome, Pastor ${user.lastName}.` : `Grace and peace, ${user.firstName}.`}</h2><p>{pastor ? 'Review confidential matters and respond with care, wisdom, and prayer.' : 'Whatever you are carrying today, you do not have to carry it alone.'}</p></div>{!pastor && <Link className="button button--light" to="/app/reports/new"><Plus size={17} /> Share a matter</Link>}<div className="welcome-banner__shape" /></section>
    {error && <div className="form-error">{error}</div>}
    <section className="stat-grid">{cards.map(([label, value, Icon, color]) => <article className={`stat-card stat-card--${color}`} key={label}><div><span>{label}</span><strong>{value}</strong></div><i><Icon /></i></article>)}</section>
    <section className="content-grid">
      <div className="panel recent-panel"><header><div><h3>{pastor ? 'Recent matters' : 'Recent reports'}</h3><p>{pastor ? 'Latest activity across all conversations' : 'Your latest confidential conversations'}</p></div><Link to="/app/reports">View all <ArrowRight size={15} /></Link></header>
        {!data ? <div className="panel-loading"><span className="spinner" /></div> : data.recent.length === 0 ? <EmptyState pastor={pastor} /> : <div className="report-table"><div className="report-table__head"><span>Report</span>{pastor && <span>Leader</span>}<span>Status</span><span>Last activity</span><span /></div>{data.recent.map((report) => <Link className="report-row" to={`/app/reports/${report._id}`} key={report._id}><div><i className={`report-icon report-icon--${report.sensitivity}`}><FileLock2 /></i><span><strong>{report.title}</strong><small>{report.reference} · {report.category}</small></span></div>{pastor && <span className="owner-cell"><span className="avatar avatar--tiny" style={{ background: report.owner?.avatarColor }}>{report.owner?.firstName?.[0]}{report.owner?.lastName?.[0]}</span>{report.owner?.firstName} {report.owner?.lastName}</span>}<span><StatusBadge status={report.status} /></span><time>{formatRelative(report.lastActivityAt)}</time><ArrowRight size={16} /></Link>)}</div>}
      </div>
      <aside className="panel care-card"><span className="care-card__icon">{pastor ? <UsersRound /> : <MessageCircleHeart />}</span><small>{pastor ? 'PASTORAL REMINDER' : 'A GENTLE REMINDER'}</small><h3>{pastor ? 'Every report is a person asking to be seen.' : 'This is your safe space.'}</h3><p>{pastor ? 'Respond thoughtfully, protect each confidence, and close matters only when care is complete.' : 'Every report and response stays between you and the pastor. Share honestly, at your own pace.'}</p><Link to={pastor ? '/app/people' : '/app/help'}>{pastor ? 'View church leaders' : 'How privacy works'} <ArrowRight size={15} /></Link></aside>
    </section>
  </div>;
}

function formatRelative(value) {
  const days = Math.floor((Date.now() - new Date(value)) / 86400000);
  if (days === 0) return 'Today'; if (days === 1) return 'Yesterday'; if (days < 7) return `${days} days ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
