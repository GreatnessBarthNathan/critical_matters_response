import { Link } from 'react-router-dom';
import { AlertTriangle, Lock, MessageCircle } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { categoryLabels, formatRelative, urgencyLabels } from '../utils/reportStatus';

/**
 * The phone-first summary of a matter. Priority is stated in words as well as colour,
 * and the whole card is one large touch target.
 */
export default function ReportCard({ report, showOwner = false }) {
  const responses = report.responses?.length ?? 0;

  return (
    <Link className={`report-card report-card--${report.urgency}`} to={`/app/reports/${report._id}`}>
      <div className="report-card__top">
        <StatusBadge status={report.status} />
        {report.urgency !== 'normal' && (
          <span className={`priority-tag priority-tag--${report.urgency}`}>
            <AlertTriangle size={12} aria-hidden="true" /> {urgencyLabels[report.urgency]}
          </span>
        )}
        {report.sensitivity === 'private' && (
          <span className="priority-tag priority-tag--sensitive"><Lock size={12} aria-hidden="true" /> Sensitive</span>
        )}
      </div>

      <h3 className="report-card__title">{report.title}</h3>

      <p className="report-card__meta">
        {report.reference} · {categoryLabels[report.category] ?? report.category}
      </p>

      {showOwner && report.owner && (
        <p className="report-card__owner">
          <span className="avatar avatar--tiny" style={{ background: report.owner.avatarColor }}>
            {report.owner.firstName?.[0]}{report.owner.lastName?.[0]}
          </span>
          {report.owner.firstName} {report.owner.lastName}
        </p>
      )}

      <div className="report-card__foot">
        <span><MessageCircle size={13} aria-hidden="true" /> {responses} {responses === 1 ? 'reply' : 'replies'}</span>
        <time dateTime={report.lastActivityAt}>{formatRelative(report.lastActivityAt)}</time>
      </div>
    </Link>
  );
}
