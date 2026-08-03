import { Link } from 'react-router-dom';

/**
 * The TGN mark is the ministry's own published asset; the CMR wordmark names this service.
 * Rendered as a plain span when there is nowhere safe to navigate (sign-in, loading).
 */
export default function Brand({ compact = false, light = false, to = null }) {
  const className = `brand ${light ? 'brand--light' : ''} ${compact ? 'brand--compact' : ''}`.trim();
  const content = (
    <>
      <img className="brand__logo" src="/tgn-logo.svg" alt="The Gospel Network" width={compact ? 32 : 40} height={compact ? 32 : 40} />
      <span className="brand__words">
        <strong>Critical Matters</strong>
        {!compact && <small>Response</small>}
      </span>
    </>
  );

  if (!to) return <span className={className}>{content}</span>;
  return <Link className={className} to={to}>{content}</Link>;
}
