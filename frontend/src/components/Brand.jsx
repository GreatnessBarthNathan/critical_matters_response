import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Brand({ compact = false, light = false }) {
  return (
    <Link className={`brand ${light ? 'brand--light' : ''}`} to="/">
      <span className="brand__mark"><ShieldCheck size={compact ? 19 : 23} strokeWidth={1.9} /></span>
      <span className="brand__words">
        <strong>Critical Matters</strong>
        {!compact && <small>Response</small>}
      </span>
    </Link>
  );
}
