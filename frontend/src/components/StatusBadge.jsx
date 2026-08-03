import { statusLabel, statusTone } from '../utils/reportStatus';

/** Status is always carried by text, never by colour alone. */
export default function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-badge--${statusTone(status)}`}>
      {statusLabel(status)}
    </span>
  );
}
