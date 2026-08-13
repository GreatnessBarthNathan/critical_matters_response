import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Lock, Send, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import StepIndicator from '../components/StepIndicator';
import { categoryLabels, urgencyLabels } from '../utils/reportStatus';
import { useAuth } from '../context/AuthContext';

const STEPS = ['Subject', 'Message', 'Review'];
const DRAFT_KEY = 'cmr:new-report-draft';
const EMPTY = { title: '', category: 'general', urgency: 'normal', content: '', sensitivity: 'standard' };

function loadDraft() {
  try {
    const stored = sessionStorage.getItem(DRAFT_KEY);
    return stored ? { ...EMPTY, ...JSON.parse(stored) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export default function CreateReportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(loadDraft);
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState({ error: '', loading: false });

  // An unsent draft survives a refresh; a successful send clears it.
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      // A full or blocked sessionStorage must never break the form.
    }
  }, [form]);

  if (user.role !== 'user') return <Navigate to="/app" replace />;

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const needsAcknowledgement = form.urgency === 'urgent';

  const canAdvance = step === 0 ? form.title.trim().length > 0 : step === 1 ? form.content.trim().length > 0 : true;

  const submit = async (event) => {
    event.preventDefault();
    if (needsAcknowledgement && !acknowledged) return;
    setState({ error: '', loading: true });
    try {
      const data = await api('/reports', { method: 'POST', body: form });
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing to clean up if storage is unavailable.
      }
      navigate(`/app/reports/${data.report._id}`, { state: { toast: data.message } });
    } catch (apiError) {
      // Values are preserved so nothing typed is ever lost to a failed send.
      setState({ error: apiError.message, loading: false });
    }
  };

  return (
    <div className="form-page">
      <div className="page-intro">
        <div>
          <Link className="back-link" to="/app/reports"><ArrowLeft size={15} aria-hidden="true" /> Back</Link>
          <h2>Share a matter</h2>
        </div>
        <span className="privacy-pill"><Lock size={14} aria-hidden="true" /> Private</span>
      </div>

      <StepIndicator steps={STEPS} current={step} label="Report progress" />

      <div aria-live="polite" role="status">
        {state.error && <div className="form-error">{state.error}</div>}
      </div>

      <form className="report-form" onSubmit={submit}>
        {step === 0 && (
          <section className="form-card">
            <h3>What is this about?</h3>
            <label htmlFor="report-title">
              Subject
              <input
                id="report-title"
                required
                maxLength={160}
                value={form.title}
                onChange={(event) => update('title', event.target.value)}
                placeholder="A short, clear subject"
              />
              <small>{form.title.length}/160</small>
            </label>
            <label htmlFor="report-category">
              Category
              <select id="report-category" value={form.category} onChange={(event) => update('category', event.target.value)}>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label htmlFor="report-urgency">
              Priority
              <select id="report-urgency" value={form.urgency} onChange={(event) => update('urgency', event.target.value)}>
                <option value="normal">Normal — when convenient</option>
                <option value="important">Important — please review soon</option>
                <option value="urgent">Urgent — needs prompt attention</option>
              </select>
            </label>
          </section>
        )}

        {step === 1 && (
          <section className="form-card">
            <h3>Your message</h3>
            <label htmlFor="report-content">
              What would you like to share?
              <textarea
                id="report-content"
                required
                rows={10}
                maxLength={10000}
                value={form.content}
                onChange={(event) => update('content', event.target.value)}
                placeholder="Take your time. Share as much as you need."
              />
              <small>{form.content.length}/10,000</small>
            </label>
            <p className="muted-note">You can revise this later while the matter is open. Every edit is recorded.</p>
          </section>
        )}

        {step === 2 && (
          <section className="form-card">
            <h3>Confidentiality and review</h3>

            <fieldset className="choice-group">
              <legend>How sensitive is this matter?</legend>
              {[
                ['standard', 'Confidential', 'Visible only to you and the pastor.'],
                ['private', 'Highly sensitive', 'Flagged for the pastor’s added discretion.'],
              ].map(([value, title, description]) => (
                <label key={value} className={`choice ${form.sensitivity === value ? 'choice--selected' : ''}`}>
                  <input
                    type="radio"
                    name="sensitivity"
                    value={value}
                    checked={form.sensitivity === value}
                    onChange={() => update('sensitivity', value)}
                  />
                  <span className="choice__body">
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  {form.sensitivity === value && <Check size={17} aria-hidden="true" />}
                </label>
              ))}
            </fieldset>

            {needsAcknowledgement && (
              <div className="inline-warning">
                <AlertTriangle size={17} aria-hidden="true" />
                <div>
                  <p>This service is not monitored around the clock.</p>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                    />
                    If anyone is in immediate danger I will contact emergency services first.
                  </label>
                </div>
              </div>
            )}

            <dl className="review-list">
              <div><dt>Subject</dt><dd>{form.title}</dd></div>
              <div><dt>Category</dt><dd>{categoryLabels[form.category]}</dd></div>
              <div><dt>Priority</dt><dd>{urgencyLabels[form.urgency]}</dd></div>
              <div><dt>Sensitivity</dt><dd>{form.sensitivity === 'private' ? 'Highly sensitive' : 'Confidential'}</dd></div>
            </dl>
          </section>
        )}

        <div className="wizard-actions">
          {step > 0 && (
            <button type="button" className="button button--ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="button button--primary" disabled={!canAdvance} onClick={() => setStep(step + 1)}>
              Continue <ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              className="button button--primary"
              disabled={state.loading || (needsAcknowledgement && !acknowledged)}
            >
              {state.loading ? <span className="button-spinner" /> : <><Send size={16} aria-hidden="true" /> Send</>}
            </button>
          )}
        </div>

        <p className="security-note"><ShieldCheck size={14} aria-hidden="true" /> Encrypted session · Private user and admin access</p>
      </form>
    </div>
  );
}
