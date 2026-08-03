import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import { categoryLabels, formatRelative, urgencyLabels } from '../utils/reportStatus';

/**
 * The desktop enhancement of the same data the cards show. Hidden on phones by CSS so
 * narrow screens never scroll a table sideways.
 */
export default function ReportTable({ reports, showOwner = false }) {
  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">Matter</th>
            {showOwner && <th scope="col">Leader</th>}
            <th scope="col">Priority</th>
            <th scope="col">Status</th>
            <th scope="col">Replies</th>
            <th scope="col">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report._id}>
              <td>
                <Link className="report-table__link" to={`/app/reports/${report._id}`}>{report.title}</Link>
                <small>{report.reference} · {categoryLabels[report.category] ?? report.category}</small>
              </td>
              {showOwner && (
                <td>
                  {report.owner ? `${report.owner.firstName} ${report.owner.lastName}` : '—'}
                </td>
              )}
              <td>
                <span className={`priority-text priority-text--${report.urgency}`}>
                  {urgencyLabels[report.urgency] ?? report.urgency}
                </span>
              </td>
              <td><StatusBadge status={report.status} /></td>
              <td>{report.responses?.length ?? 0}</td>
              <td><time dateTime={report.lastActivityAt}>{formatRelative(report.lastActivityAt)}</time></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
