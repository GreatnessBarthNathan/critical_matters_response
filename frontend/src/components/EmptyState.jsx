import { Link } from 'react-router-dom';
import { FileHeart, Plus } from 'lucide-react';

export default function EmptyState({ pastor = false, filtered = false }) {
  return (
    <div className="empty-state">
      <span aria-hidden="true"><FileHeart /></span>
      <h3>
        {filtered ? 'No matching matters' : pastor ? 'Nothing has been shared yet' : 'Nothing open right now'}
      </h3>
      <p>
        {filtered
          ? 'Try a different search or filter.'
          : pastor
            ? 'New matters from church leaders will appear here.'
            : 'When something is weighing on you, this is a safe place to share it.'}
      </p>
      {!pastor && !filtered && (
        <Link className="button button--primary button--small" to="/app/reports/new">
          <Plus size={16} aria-hidden="true" /> Share a matter
        </Link>
      )}
    </div>
  );
}
