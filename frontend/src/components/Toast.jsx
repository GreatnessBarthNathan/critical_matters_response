import { CheckCircle2, X, XCircle } from 'lucide-react';

export default function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`toast toast--${toast.type || 'success'}`} role="status">
      {toast.type === 'error' ? <XCircle size={19} /> : <CheckCircle2 size={19} />}
      <span>{toast.message}</span>
      <button onClick={onClose} aria-label="Close notification"><X size={16} /></button>
    </div>
  );
}
