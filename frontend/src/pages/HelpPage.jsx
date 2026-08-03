import { AlertTriangle, FilePenLine, KeyRound, LifeBuoy, LockKeyhole, MessageCircleHeart, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

const questions = [
  ['Who can read my reports?', 'Only the account that created a report and users with the pastor role can access it. Other church leaders cannot see your reports or responses.'],
  ['Can I edit a report after sending it?', 'Yes. You can edit the subject and message while the report is open. Closed reports remain readable but cannot be changed.'],
  ['How does password recovery work without email?', 'When you register, you receive a recovery key shown once. Your email, recovery key, and a new password are required on the forgot-password page. Keep the key somewhere safe.'],
  ['What does “highly sensitive” mean?', 'All reports are confidential. The highly sensitive label simply tells the pastor that the matter needs added discretion and makes it easier to filter in the care dashboard.'],
  ['Can I continue a conversation?', 'Yes. Open any report and use the private reply box. Both you and the pastor can continue responding until the pastor closes the matter.'],
];

export default function HelpPage() {
  const [open, setOpen] = useState(0);
  return <div className="help-page"><div className="page-intro"><div><h2>Help & privacy</h2><p>Understand how your confidential care space works.</p></div></div>
    <section className="privacy-hero"><span><ShieldCheck /></span><div><small>OUR PRIVACY COMMITMENT</small><h3>Your story belongs to you.</h3><p>Critical Matters Response is designed so each conversation stays between the church leader who created it and the pastor. Access is checked on every report request.</p></div></section>
    <div className="help-grid"><main className="panel faq"><h3>Frequently asked questions</h3>{questions.map(([question, answer], index) => <article key={question}><button onClick={() => setOpen(open === index ? -1 : index)}><span>{question}</span><b>{open === index ? '−' : '+'}</b></button>{open === index && <p>{answer}</p>}</article>)}</main>
      <aside><section className="panel help-list"><h3>How it works</h3><div><LockKeyhole /><span><strong>Private access</strong><small>User and pastor only</small></span></div><div><FilePenLine /><span><strong>Editable reports</strong><small>While a matter is open</small></span></div><div><MessageCircleHeart /><span><strong>Secure responses</strong><small>One continuous conversation</small></span></div><div><KeyRound /><span><strong>No recovery email</strong><small>Use your saved key</small></span></div></section><section className="panel crisis-note"><AlertTriangle /><h3>Immediate danger?</h3><p>This platform is not an emergency service. If someone is at immediate risk, contact local emergency services or a trusted person nearby.</p></section></aside>
    </div><div className="help-footer"><LifeBuoy /> <span><strong>Still need help?</strong><small>Speak directly with your church administrator or pastor.</small></span></div>
  </div>;
}
