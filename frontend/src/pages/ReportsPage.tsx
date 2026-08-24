import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { api, queryString } from '../api/client';
import EmptyState from '../components/EmptyState';
import ReportCard from '../components/ReportCard';
import ReportTable from '../components/ReportTable';
import { categoryLabels, reportStatus } from '../utils/reportStatus';
import { useAuth } from '../context/AuthContext';

const DEFAULT_FILTERS = { search: '', status: 'open', category: 'all' };

export default function ReportsPage({ archivedOnly = false }) {
  const { user } = useAuth();
  const pastor = user.role === 'admin';
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(archivedOnly ? { ...DEFAULT_FILTERS, status: 'archived' } : DEFAULT_FILTERS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/reports${queryString({ ...filters, status: archivedOnly ? 'archived' : filters.status })}`);
      setReports(data.reports);
      setError('');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }, [filters, archivedOnly]);

  useEffect(() => {
    const timer = setTimeout(load, filters.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.search]);

  const filtered = Boolean(filters.search) || filters.category !== 'all' || (!archivedOnly && filters.status !== 'open');

  return (
    <div className="reports-page">
      <div className="page-intro">
        <div>
          <h2>{archivedOnly ? 'Archive' : pastor ? 'All matters' : 'Your matters'}</h2>
          <p>
            {archivedOnly
              ? 'Closed matters, kept for reference and read-only.'
              : pastor ? 'Highest priority first.' : 'Your confidential conversations.'}
          </p>
        </div>
        {!pastor && !archivedOnly && (
          <Link className="button button--primary button--small" to="/app/reports/new">
            <Plus size={16} aria-hidden="true" /> New
          </Link>
        )}
      </div>

      <div className="filter-bar">
        <div className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search matters"
            placeholder="Search reference"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          />
        </div>
        {!archivedOnly && (
          <label>
            <span className="visually-hidden">Filter by status</span>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="open">Open matters</option>
              <option value="all">All statuses</option>
              {Object.entries(reportStatus).map(([value, { label }]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="visually-hidden">Filter by category</span>
          <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
            <option value="all">All categories</option>
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div aria-live="polite" role="status">
        {error && <div className="form-error">{error}</div>}
      </div>

      <section className="panel section-panel">
        <header className="section-panel__header">
          <h3>{loading ? 'Loading…' : `${reports.length} ${reports.length === 1 ? 'matter' : 'matters'}`}</h3>
        </header>

        {loading ? (
          <div className="panel-loading"><span className="spinner" /></div>
        ) : reports.length === 0 ? (
          <EmptyState pastor={pastor} filtered={filtered} />
        ) : (
          <>
            <div className="card-list card-list--phone-only">
              {reports.map((report) => <ReportCard key={report._id} report={report} showOwner={pastor} />)}
            </div>
            <ReportTable reports={reports} showOwner={pastor} />
          </>
        )}
      </section>
    </div>
  );
}
