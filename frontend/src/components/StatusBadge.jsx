export const statusLabels = { submitted: 'Submitted', in_review: 'In review', responded: 'Responded', closed: 'Closed' };
export default function StatusBadge({ status }) { return <span className={`status-badge status-badge--${status}`}>{statusLabels[status] || status}</span>; }
