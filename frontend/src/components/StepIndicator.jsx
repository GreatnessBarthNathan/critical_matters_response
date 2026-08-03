import { Check } from 'lucide-react';

/**
 * Accessible progress for the report and onboarding flows.
 * Position is announced in text, never by colour alone.
 */
export default function StepIndicator({ steps, current, label = 'Progress' }) {
  return (
    <nav className="step-indicator" aria-label={label}>
      <p className="step-indicator__count">Step {current + 1} of {steps.length}: {steps[current]}</p>
      <ol>
        {steps.map((step, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
          return (
            <li key={step} className={`step-indicator__step step-indicator__step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="step-indicator__marker" aria-hidden="true">
                {state === 'done' ? <Check size={14} strokeWidth={3} /> : index + 1}
              </span>
              <span className="step-indicator__label">{step}</span>
              <span className="visually-hidden">
                {state === 'done' ? ' (completed)' : state === 'current' ? ' (current step)' : ' (not started)'}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
