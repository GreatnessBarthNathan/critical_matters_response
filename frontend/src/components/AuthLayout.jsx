import { ArrowLeft, LockKeyhole, Quote } from 'lucide-react';
import { Link } from 'react-router-dom';
import Brand from './Brand';

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Brand light />
        <div className="auth-story__content">
          <span className="eyebrow eyebrow--light"><LockKeyhole size={14} /> A sacred space for honest conversations</span>
          <h1>You don’t have to carry it <em>alone.</em></h1>
          <p>A private, thoughtful channel created for church leaders to share life’s critical matters directly with their pastor.</p>
        </div>
        <blockquote>
          <Quote size={22} />
          “Carry each other’s burdens, and in this way you will fulfill the law of Christ.”
          <cite>Galatians 6:2</cite>
        </blockquote>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to home</Link>
          <div className="auth-card__heading"><h2>{title}</h2><p>{subtitle}</p></div>
          {children}
        </div>
      </section>
    </main>
  );
}
