import { useState } from 'react';
import { Copy, Check, ShieldAlert } from 'lucide-react';

/**
 * Recovery codes are shown exactly once. The caller cannot continue until the person
 * explicitly confirms they have saved them.
 */
export default function RecoveryCodes({ codes, onAcknowledge, actionLabel = 'I have saved my codes — continue' }) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="recovery-codes">
      <div className="recovery-codes__warning" role="note">
        <ShieldAlert size={18} />
        <p>
          This service sends no email. These {codes.length} codes are the only way to sign in if you
          forget your password or lose your authenticator. Each code works once, and they will never be shown again.
        </p>
      </div>

      <ul className="recovery-codes__list">
        {codes.map((code) => <li key={code}><code>{code}</code></li>)}
      </ul>

      <button type="button" className="button button--ghost button--full" onClick={copy}>
        {copied ? <><Check size={16} /> Copied to clipboard</> : <><Copy size={16} /> Copy all codes</>}
      </button>

      <label className="check-label">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        I have written these codes down somewhere safe.
      </label>

      <button
        type="button"
        className="button button--primary button--full"
        disabled={!confirmed}
        onClick={onAcknowledge}
      >
        {actionLabel}
      </button>
    </div>
  );
}
