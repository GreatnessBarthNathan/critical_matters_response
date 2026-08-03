import { ArrowRight, Check, HeartHandshake, LockKeyhole, MessageCircleHeart, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const { user } = useAuth();
  return (
    <div className="landing">
      <nav className="landing-nav page-width">
        <Brand />
        <div className="landing-nav__links">
          <a href="#how-it-works">How it works</a><a href="#privacy">Privacy</a>
          {user ? <Link className="button button--primary button--small" to="/app">Open dashboard <ArrowRight size={15} /></Link> : <><Link to="/login">Sign in</Link><Link className="button button--primary button--small" to="/register">Create account</Link></>}
        </div>
      </nav>

      <header className="hero page-width">
        <div className="hero__copy">
          <span className="eyebrow"><ShieldCheck size={15} /> Confidential pastoral care</span>
          <h1>Some matters need a <em>safe place</em> to be heard.</h1>
          <p>Critical Matters Response gives church leaders a private, trusted channel to share personal concerns and receive thoughtful guidance directly from their pastor.</p>
          <div className="hero__actions">
            <Link className="button button--primary" to={user ? '/app/reports/new' : '/register'}>Share a matter <ArrowRight size={17} /></Link>
            <Link className="button button--ghost" to={user ? '/app' : '/login'}>{user ? 'Go to dashboard' : 'I have an account'}</Link>
          </div>
          <div className="hero__trust"><span><Check size={15} /> Private by design</span><span><Check size={15} /> Direct pastor access</span><span><Check size={15} /> No email tracking</span></div>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="visual-orbit visual-orbit--one" /><div className="visual-orbit visual-orbit--two" />
          <div className="confidential-card">
            <span className="confidential-card__icon"><LockKeyhole size={25} /></span>
            <small>Private conversation</small><strong>Your matter has been received</strong>
            <div className="fake-lines"><i /><i /><i /></div>
            <div className="pastor-chip"><span>PA</span><div><b>Pastor</b><small>Reviewing with care</small></div><i className="online-dot" /></div>
          </div>
          <div className="floating-note"><ShieldCheck size={16} /> End-to-end privacy</div>
        </div>
      </header>

      <section className="assurance-strip" id="privacy"><div className="page-width">
        <div><LockKeyhole /><span><strong>Strictly confidential</strong><small>Only you and the pastor can view your reports</small></span></div>
        <div><MessageCircleHeart /><span><strong>Personal responses</strong><small>Continue the conversation safely in one place</small></span></div>
        <div><HeartHandshake /><span><strong>Care without judgment</strong><small>A compassionate space for real-life matters</small></span></div>
      </div></section>

      <section className="how page-width" id="how-it-works">
        <span className="eyebrow">Simple & secure</span><h2>Support is three quiet steps away.</h2>
        <div className="steps-grid">
          {[['01','Create your account','Join the secure portal using your unique email address.'],['02','Share what matters','Write freely, choose the sensitivity level, and send it privately.'],['03','Receive guidance','Your pastor responds inside your confidential conversation.']].map(([number,title,text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}
        </div>
      </section>
      <footer><div className="page-width"><Brand light /><p>Confidential care for the people who care for others.</p><small>© {new Date().getFullYear()} Critical Matters Response</small></div></footer>
    </div>
  );
}
