import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { api } from '../api/client';
import EmptyState from '../components/EmptyState';
import ReportCard from '../components/ReportCard';
import ReportTable from '../components/ReportTable';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();
  const pastor = user.role === 'pastor';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/reports/stats')
      .then(setData)
      .catch((apiError) => setError(apiError.message))
      // Track loading separately, so a refused request stops the spinner instead of hanging.
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;
  // Phones show exactly two high-value numbers: what is open, and what is waiting on you.
  const open = stats?.open ?? 0;
  const waiting = pastor ? (stats?.new ?? 0) + (stats?.awaitingPastor ?? 0) : (stats?.awaitingLeader ?? 0);

  return (
    <div className="dashboard-page">
      <section className="greeting">
        <p className="greeting__eyebrow">{pastor ? 'Pastoral care' : 'Your care space'}</p>
        <h2>{pastor ? `Welcome, Pastor ${user.lastName}.` : `Grace and peace, ${user.firstName}.`}</h2>
      </section>

      <div aria-live="polite" role="status">
        {error && <div className="form-error">{error}</div>}
      </div>

      <section className="stat-pair" aria-label="Summary">
        <article className="stat-tile">
          <span className="stat-tile__label">Open</span>
          <strong className="stat-tile__value">{open}</strong>
        </article>
        <article className="stat-tile stat-tile--accent">
          <span className="stat-tile__label">{pastor ? 'Needs your reply' : 'New replies'}</span>
          <strong className="stat-tile__value">{waiting}</strong>
        </article>
      </section>

      {!pastor && (
        <Link className="button button--primary button--full create-action" to="/app/reports/new">
          <Plus size={18} aria-hidden="true" /> Share a matter
        </Link>
      )}

      <section className="panel section-panel">
        <header className="section-panel__header">
          <h3>{pastor ? 'Needs attention' : 'Recent matters'}</h3>
          <Link to="/app/reports">View all <ArrowRight size={15} aria-hidden="true" /></Link>
        </header>

        {loading ? (
          <div className="panel-loading"><span className="spinner" /></div>
        ) : !data ? (
          <p className="empty-note">This list could not be loaded. The message above explains why.</p>
        ) : data.recent.length === 0 ? (
          <EmptyState pastor={pastor} />
        ) : (
          <>
            {/* Phones read cards; desktop enhances the same data into the operational table. */}
            <div className="card-list card-list--phone-only">
              {data.recent.map((report) => (
                <ReportCard key={report._id} report={report} showOwner={pastor} />
              ))}
            </div>
            <ReportTable reports={data.recent} showOwner={pastor} />
          </>
        )}
      </section>
    </div>
  );
}
