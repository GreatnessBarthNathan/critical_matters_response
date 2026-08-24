import Brand from './Brand';

/**
 * A discreet entry shell. It carries no ministry storytelling, no public signup and no
 * description of what this service is for — only what a known leader needs to sign in.
 */
export default function AuthLayout({ children, title, subtitle, footer = null }) {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Brand />
        <div className="auth-card__heading">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {children}
        {footer}
      </div>
    </main>
  );
}
