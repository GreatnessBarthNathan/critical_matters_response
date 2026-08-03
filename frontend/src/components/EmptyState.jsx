import { FileHeart, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function EmptyState({ pastor = false, filtered = false }) {
  return <div className="empty-state"><span><FileHeart /></span><h3>{filtered ? 'No matching reports' : pastor ? 'No matters have been shared yet' : 'Your care space is clear'}</h3><p>{filtered ? 'Try adjusting your search or filter.' : pastor ? 'New reports from church leaders will appear here.' : 'When something is weighing on you, this is a safe place to share it.'}</p>{!pastor && !filtered && <Link className="button button--primary button--small" to="/app/reports/new"><Plus size={16} /> Create a report</Link>}</div>;
}
