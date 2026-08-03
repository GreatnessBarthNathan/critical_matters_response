import { FileLock2, Filter, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, queryString } from '../api/client';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

export default function ReportsPage({ privateOnly = false }) {
  const { user } = useAuth(); const pastor = user.role === 'pastor';
  const [reports, setReports] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [filters, setFilters] = useState({ search: '', status: 'all', category: 'all' });
  const load = useCallback(async () => { setLoading(true); try { const data = await api(`/reports${queryString({ ...filters, sensitivity: privateOnly ? 'private' : undefined })}`); setReports(data.reports); setError(''); } catch (err) { setError(err.message); } finally { setLoading(false); } }, [filters, privateOnly]);
  useEffect(() => { const timer = setTimeout(load, filters.search ? 300 : 0); return () => clearTimeout(timer); }, [load, filters.search]);
  return <div className="reports-page">
    <div className="page-intro"><div><h2>{privateOnly ? 'Highly sensitive reports' : pastor ? 'All confidential matters' : 'Your reports'}</h2><p>{privateOnly ? 'Reports marked for added pastoral discretion.' : pastor ? 'Review and respond to matters shared by church leaders.' : 'View, edit, and continue your private conversations.'}</p></div>{!pastor && <Link className="button button--primary" to="/app/reports/new"><Plus size={17} /> New report</Link>}</div>
    <div className="filter-bar"><div className="search-field"><Search size={18} /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search by subject or reference..." /></div><label><Filter size={16} /><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">All statuses</option><option value="submitted">Submitted</option><option value="in_review">In review</option><option value="responded">Responded</option><option value="closed">Closed</option></select></label><label><SlidersHorizontal size={16} /><select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="all">All categories</option><option value="general">General</option><option value="family">Family</option><option value="health">Health</option><option value="financial">Financial</option><option value="ministry">Ministry</option><option value="relationship">Relationship</option><option value="other">Other</option></select></label></div>
    {error && <div className="form-error">{error}</div>}
    <section className="panel reports-list"><header><span>{loading ? 'Loading…' : `${reports.length} ${reports.length === 1 ? 'report' : 'reports'}`}</span><small><FileLock2 size={14} /> Confidential access</small></header>
      {loading ? <div className="panel-loading"><span className="spinner" /></div> : reports.length === 0 ? <EmptyState pastor={pastor} filtered={Boolean(filters.search || filters.status !== 'all' || filters.category !== 'all')} /> : reports.map((report) => <Link className="report-list-item" to={`/app/reports/${report._id}`} key={report._id}><span className={`report-icon report-icon--${report.sensitivity}`}><FileLock2 /></span><div className="report-list-item__title"><strong>{report.title}</strong><small>{report.reference} · {report.category}</small></div>{pastor && <div className="report-list-item__owner"><span className="avatar avatar--tiny" style={{ background: report.owner?.avatarColor }}>{report.owner?.firstName?.[0]}{report.owner?.lastName?.[0]}</span><span>{report.owner?.firstName} {report.owner?.lastName}<small>{report.owner?.ministry || 'Church leader'}</small></span></div>}<StatusBadge status={report.status} /><div className="report-list-item__date"><strong>{new Date(report.lastActivityAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong><small>{report.responses.length} {report.responses.length === 1 ? 'response' : 'responses'}</small></div></Link>)}
    </section>
  </div>;
}
