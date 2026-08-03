import { useState } from 'react';
import { AlertTriangle, LifeBuoy, ShieldCheck } from 'lucide-react';

const QUESTIONS = [
  ['Who can read my matters?', 'Only you and the pastor. Other church leaders cannot see your matters or replies — access is checked on every single request.'],
  ['Can I edit a matter after sending it?', 'Yes, while it is open. Your original wording is kept in the revision history, so nothing is silently rewritten. Archived matters are read-only.'],
  ['How do I get back in without email?', 'This service sends no email. Use one of the recovery codes you saved when your account was created. If you no longer have them, ask your pastor for a one-time reset code — they will verify who you are first.'],
  ['What does “highly sensitive” mean?', 'Every matter is confidential. This label tells the pastor the matter needs added discretion.'],
  ['Why do I need an authenticator app?', 'It is required for the pastor account and optional for leaders. It means a stolen password alone is not enough to read anyone’s matters.'],
  ['How do I join?', 'Only by invitation from the pastor. There is no public sign-up.'],
];

export default function HelpPage() {
  const [open, setOpen] = useState(0);

  return (
    <div className="help-page">
      <div className="page-intro">
        <div>
          <h2>Help & privacy</h2>
          <p>How this confidential space works.</p>
        </div>
      </div>

      <section className="panel privacy-hero">
        <span aria-hidden="true"><ShieldCheck /></span>
        <div>
          <h3>Your story belongs to you.</h3>
          <p>Each conversation stays between the leader who created it and the pastor.</p>
        </div>
      </section>

      <section className="panel faq">
        <h3>Common questions</h3>
        {QUESTIONS.map(([question, answer], index) => (
          <article key={question}>
            <button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? -1 : index)}>
              <span>{question}</span>
              <b aria-hidden="true">{open === index ? '−' : '+'}</b>
            </button>
            {open === index && <p>{answer}</p>}
          </article>
        ))}
      </section>

      <section className="panel crisis-note">
        <AlertTriangle aria-hidden="true" />
        <h3>Immediate danger?</h3>
        <p>
          This service is not an emergency line and is not monitored around the clock. If someone is at
          immediate risk, contact local emergency services or a trusted person nearby first.
        </p>
      </section>

      <p className="help-footer">
        <LifeBuoy size={17} aria-hidden="true" /> Still need help? Speak with your pastor directly.
      </p>
    </div>
  );
}
