import { AlertTriangle, ArrowLeft, Check, FileLock2, Info, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const categories = ['general', 'family', 'health', 'financial', 'ministry', 'relationship', 'other'];

export default function CreateReportPage() {
  const { user } = useAuth(); const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', category: 'general', sensitivity: 'standard', urgency: 'normal', content: '' });
  const [state, setState] = useState({ error: '', loading: false });
  if (user.role === 'pastor') return <Navigate to="/app/reports" replace />;
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event) => { event.preventDefault(); setState({ error: '', loading: true }); try { const data = await api('/reports', { method: 'POST', body: form }); navigate(`/app/reports/${data.report._id}`, { state: { toast: data.message } }); } catch (error) { setState({ error: error.message, loading: false }); } };
  return <div className="form-page">
    <div className="page-intro"><div><Link to="/app/reports"><ArrowLeft size={15} /> Back to reports</Link><h2>Share what’s on your heart</h2><p>Write openly. Your report is shared only with your pastor.</p></div><span className="privacy-pill"><LockKeyhole size={15} /> Private & secure</span></div>
    {state.error && <div className="form-error">{state.error}</div>}
    <form className="report-form" onSubmit={submit}>
      <section className="form-section"><div className="form-section__heading"><span>1</span><div><h3>About this matter</h3><p>Help your pastor understand the nature of your concern.</p></div></div><div className="form-section__body">
        <label>Report subject <b>*</b><input required maxLength="160" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Give this matter a clear, private title" /><small>{form.title.length}/160 characters</small></label>
        <div className="form-row"><label>Category<select value={form.category} onChange={(e) => update('category', e.target.value)}>{categories.map((item) => <option key={item} value={item}>{capitalize(item)}</option>)}</select></label><label>Urgency<select value={form.urgency} onChange={(e) => update('urgency', e.target.value)}><option value="normal">Normal — when convenient</option><option value="important">Important — please review soon</option><option value="urgent">Urgent — needs prompt attention</option></select></label></div>
        {form.urgency === 'urgent' && <div className="inline-warning"><AlertTriangle size={17} /> If anyone is in immediate danger, contact local emergency services or a trusted person nearby first.</div>}
      </div></section>
      <section className="form-section"><div className="form-section__heading"><span>2</span><div><h3>Your message</h3><p>Take your time and share as much context as you need.</p></div></div><div className="form-section__body"><label>What would you like to share? <b>*</b><textarea required maxLength="10000" rows="10" value={form.content} onChange={(e) => update('content', e.target.value)} placeholder="Dear Pastor, I would like to share something that has been weighing on me..." /><small>{form.content.length}/10,000 characters</small></label><div className="writing-note"><Info size={16} /> You can return and edit this report while the matter is open.</div></div></section>
      <section className="form-section"><div className="form-section__heading"><span>3</span><div><h3>Confidentiality level</h3><p>All reports are private. This label helps the pastor handle especially sensitive matters.</p></div></div><div className="form-section__body sensitivity-options">
        <label className={form.sensitivity === 'standard' ? 'selected' : ''}><input type="radio" name="sensitivity" checked={form.sensitivity === 'standard'} onChange={() => update('sensitivity', 'standard')} /><span><ShieldCheck /></span><div><strong>Confidential</strong><p>Visible only to you and the pastor.</p></div><i>{form.sensitivity === 'standard' && <Check />}</i></label>
        <label className={form.sensitivity === 'private' ? 'selected' : ''}><input type="radio" name="sensitivity" checked={form.sensitivity === 'private'} onChange={() => update('sensitivity', 'private')} /><span><FileLock2 /></span><div><strong>Highly sensitive</strong><p>Marked for the pastor’s added discretion.</p></div><i>{form.sensitivity === 'private' && <Check />}</i></label>
      </div></section>
      <div className="submit-bar"><p><LockKeyhole size={15} /> Encrypted session · Pastor-only access</p><button type="submit" className="button button--primary" disabled={state.loading}>{state.loading ? <span className="button-spinner" /> : <><Send size={17} /> Send confidentially</>}</button></div>
    </form>
  </div>;
}
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
